// The built docs site, browsed the way Vercel serves it (cleanUrls: /docs/api.html → /docs/api, and /docs/api/
// also works). Every page is opened at every address it can have, and every link, stylesheet and script on it
// must lead to a real file, and every #anchor to a real heading.
import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SITE = new URL("../site/", import.meta.url).pathname;

/** What Vercel answers for a path: the file it serves, or null for a 404. */
function serve(path) {
  const p = decodeURIComponent(path).replace(/^\//, "");
  const tries = path.endsWith("/") ? [p + "index.html"] : [p, p + ".html", p + "/index.html"];
  for (const t of tries) {
    const f = join(SITE, t);
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return null;
}

/** Every address a page can be reached at: with or without the trailing slash. */
const addresses = (dir) => (dir === "/docs/" ? ["/docs", "/docs/"] : [dir.slice(0, -1), dir]);

let pages = [];
beforeAll(() => {
  execFileSync("node", ["scripts/docs.mjs"], { cwd: new URL("..", import.meta.url).pathname });
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  pages = walk(join(SITE, "docs")).filter((f) => f.endsWith("index.html"))
    .map((f) => "/" + f.slice(SITE.length).replace(/index\.html$/, ""));
});

describe("docs site as served by Vercel", () => {
  it("has a page per guide", () => {
    expect(pages.length).toBeGreaterThan(15);
    expect(pages).toContain("/docs/");
    expect(pages).toContain("/docs/api/");
  });

  it("every link, stylesheet, script and anchor works from every address of every page", () => {
    const broken = [];
    for (const dir of pages) {
      const html = readFileSync(serve(dir), "utf8");
      const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      for (const at of addresses(dir)) {
        for (const ref of refs) {
          if (/^(https?:|mailto:)/.test(ref)) continue;
          const u = new URL(ref, "https://site.test" + at);
          const file = serve(u.pathname);
          if (!file) { broken.push(`${at}: ${ref} → ${u.pathname} (404)`); continue; }
          if (u.hash && file.endsWith(".html")) {
            const id = decodeURIComponent(u.hash.slice(1));
            if (!readFileSync(file, "utf8").includes(`id="${id}"`)) broken.push(`${at}: ${ref} (no heading #${id})`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("the home page's links into the docs work", () => {
    const html = readFileSync(join(SITE, "index.html"), "utf8");
    const docsLinks = [...html.matchAll(/href="(\/docs[^"]*)"/g)].map((m) => m[1]);
    expect(docsLinks.length).toBeGreaterThan(2);
    for (const at of ["/", "/index.html"]) {
      for (const ref of docsLinks) expect(serve(new URL(ref, "https://site.test" + at).pathname), ref).not.toBeNull();
    }
  });
});
