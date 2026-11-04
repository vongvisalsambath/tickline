// Builds the docs site (site/docs/) from docs/*.md: one page per file, a sidebar, an on-page outline and search.
import { marked } from "marked";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const REPO = "https://github.com/vongvisalsambath/tickline/blob/main/";
const root = (p) => new URL("../" + p, import.meta.url);
const out = "site/docs/";

// sidebar order: [file, title in the sidebar, output name]
const PAGES = [
  ["docs/README.md", "Overview", "index"],
  ["docs/getting-started.md", "Getting started", "getting-started"],
  ["docs/data.md", "Feeding data", "data"],
  ["docs/configuration.md", "Configuration", "configuration"],
  ["docs/drawing.md", "Overlays, shapes and drawings", "drawing"],
  ["docs/indicators.md", "Indicators", "indicators"],
  ["docs/zoom.md", "Zoom and navigation", "zoom"],
  ["docs/animation.md", "Animation", "animation"],
  ["docs/styling.md", "Styling and themes", "styling"],
  ["docs/frameworks.md", "Frameworks", "frameworks"],
  ["docs/full-screen-and-images.md", "Full screen and images", "full-screen-and-images"],
  ["docs/multiple-charts.md", "Several charts", "multiple-charts"],
  ["docs/performance.md", "Performance", "performance"],
  ["docs/accessibility.md", "Accessibility", "accessibility"],
  ["docs/troubleshooting.md", "Troubleshooting", "troubleshooting"],
  ["docs/ai.md", "AI assistants", "ai"],
  ["docs/api.md", "API reference", "api"],
  ["CHANGELOG.md", "Changelog", "changelog"],
  ["docs/publishing.md", "Publishing (maintainers)", "publishing"],
];
const byFile = new Map(PAGES.map(([f, , name]) => [f, name]));
/** Every page has its own folder, and links are full paths, so they work at /docs/api, /docs/api/ or /docs/api/index.html. */
const url = (name) => (name === "index" ? "/docs/" : `/docs/${name}/`);

// GitHub's heading ids, so links work the same on GitHub and here
const slug = (s) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (md) => md.replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

/** Links between docs pages stay on the site; anything else in the repository goes to GitHub. */
function rewrite(href, from) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path, anchor] = href.split("#");
  const parts = (from.slice(0, from.lastIndexOf("/") + 1) + path).split("/");
  const stack = [];
  for (const p of parts) { if (p === "..") stack.pop(); else if (p && p !== ".") stack.push(p); }
  const target = stack.join("/");
  const page = byFile.get(target);
  if (page) return `${url(page)}${anchor ? "#" + anchor : ""}`;
  return REPO + target + (anchor ? "#" + anchor : "");
}

const search = [];
const nav = (current) => PAGES.map(([, title, name]) =>
  `<a href="${url(name)}"${name === current ? ' aria-current="page"' : ""}>${esc(title)}</a>`).join("\n");

for (const [file, title, name] of PAGES) {
  const md = readFileSync(root(file), "utf8");
  const outline = [];
  let section = { page: name, pageTitle: title, id: "", title, text: [] };
  search.push(section);
  const tokens = marked.lexer(md);
  marked.walkTokens(tokens, (t) => {
    if (t.type === "link") t.href = rewrite(t.href, file);
  });
  // collect headings and text for the outline and search
  for (const t of tokens) {
    if (t.type === "heading") {
      const id = slug(plain(t.text));
      if (t.depth === 2) outline.push({ id, text: plain(t.text) });
      if (t.depth === 2 || t.depth === 3) { section = { page: name, pageTitle: title, id, title: plain(t.text), text: [] }; search.push(section); }
    } else if (t.type === "paragraph" || t.type === "list" || t.type === "table") {
      section.text.push(plain(t.raw).replace(/\s+/g, " ").slice(0, 400));
    }
  }
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens: inline, depth, text }) {
    const id = slug(plain(text));
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${this.parser.parseInline(inline)}</h${depth}>\n`;
  };
  renderer.code = function ({ text, lang }) {
    return `<pre class="code"><code class="${esc(lang ?? "")}">${esc(text)}</code></pre>\n`;
  };
  renderer.table = function (token) {
    // keep the default table, but scrollable on phones
    return `<div class="table-wrap">${marked.Renderer.prototype.table.call(this, token)}</div>\n`;
  };
  const body = marked.parser(tokens, { renderer });
  const h1 = tokens.find((t) => t.type === "heading" && t.depth === 1);
  const pageTitle = h1 ? plain(h1.text) : title;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(pageTitle)} · Tickline docs</title>
  <meta name="description" content="${esc(plain(tokens.find((t) => t.type === "paragraph")?.text ?? "Tickline documentation").slice(0, 160))}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/css/site.css" />
  <link rel="stylesheet" href="/css/docs.css" />
</head>
<body class="docs">
  <a class="skip" href="#content">Skip to content</a>
  <header class="nav">
    <a class="brand" href="/"><span class="mark" aria-hidden="true"></span>Tickline</a>
    <nav aria-label="Site">
      <a href="/#demo">Demo</a>
      <a href="/docs/" aria-current="true">Docs</a>
      <a href="/docs/api/">API</a>
      <a class="gh" href="https://github.com/vongvisalsambath/tickline">GitHub</a>
    </nav>
    <button class="menu" type="button" aria-expanded="false" aria-controls="sidebar">Menu</button>
    <button class="theme" type="button" data-theme-toggle aria-label="Switch to light theme">☀</button>
  </header>
  <div class="docs-layout">
    <aside class="sidebar" id="sidebar" aria-label="Documentation">
      <label class="search"><span class="sr-only">Search the docs</span>
        <input type="search" id="search" placeholder="Search the docs" autocomplete="off" /></label>
      <div class="results" id="results" hidden></div>
      <nav class="pages">${nav(name)}</nav>
    </aside>
    <main id="content" class="doc">
${body}
      <p class="edit"><a href="${REPO}${file}">Edit this page on GitHub</a></p>
    </main>
    ${outline.length > 2 ? `<nav class="outline" aria-label="On this page"><p>On this page</p>${outline.map((o) => `<a href="#${o.id}">${esc(o.text)}</a>`).join("")}</nav>` : "<div></div>"}
  </div>
  <script type="module" src="/js/docs.js"></script>
</body>
</html>
`;
  const dir = out + (name === "index" ? "" : name + "/");
  mkdirSync(root(dir), { recursive: true });
  writeFileSync(root(dir + "index.html"), html);
}

// search index: page, heading and some text per section
const index = search.map((s) => ({ p: s.page, pt: s.pageTitle, id: s.id, t: s.title, x: s.text.join(" ").slice(0, 600) }));
writeFileSync(root(out + "search.json"), JSON.stringify(index));
console.log(`site/docs: ${PAGES.length} pages, ${index.length} search entries`);
