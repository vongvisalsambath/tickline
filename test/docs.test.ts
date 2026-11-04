// The docs must keep up with the code: every public member, export, attribute and event is documented,
// and every link between docs pages (and to headings) works.
import { describe, expect, it } from "vitest";
import chartSrc from "../src/chart.ts?raw";
import elementSrc from "../src/element.ts?raw";
import indexSrc from "../src/index.ts?raw";

const docs = import.meta.glob<string>("../docs/*.md", { query: "?raw", import: "default", eager: true });
const root = import.meta.glob<string>(["../README.md", "../CHANGELOG.md", "../mcp/README.md"], { query: "?raw", import: "default", eager: true });
const api = docs["../docs/api.md"];
const configuration = docs["../docs/configuration.md"];

/** Public (non-private) methods, getters and properties declared in a class body. */
function publicMembers(src: string, cls: string): string[] {
  const start = src.indexOf(`export class ${cls}`);
  const body = src.slice(start, src.indexOf("\n}\n", start));
  const names = new Set<string>();
  for (const line of body.split("\n")) {
    const m = /^  (?:async )?(?:get |set )?([a-zA-Z]\w*)\s*[(<]/.exec(line) ?? /^  readonly ([a-zA-Z]\w*)/.exec(line);
    if (m && !/^\s*(private|protected|static)\b/.test(line)) names.add(m[1]);
  }
  for (const skip of ["constructor", "connectedCallback", "disconnectedCallback", "attributeChangedCallback", "observedAttributes"]) names.delete(skip);
  return [...names].sort();
}

/** GitHub-style heading ids. */
const slug = (h: string) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");

describe("docs coverage", () => {
  it("documents every public member of Chart", () => {
    const missing = publicMembers(chartSrc, "Chart").filter((n) => !api.includes(`\`${n}`) && !api.includes(` ${n}(`) && !api.includes(`, ${n}`));
    expect(missing).toEqual([]);
  });

  it("documents every public member of <trade-chart>", () => {
    const missing = publicMembers(elementSrc, "TradeChartElement").filter((n) => !api.includes(`\`${n}`) && !api.includes(`, ${n}`));
    expect(missing).toEqual([]);
  });

  it("documents every export", () => {
    const names = [...indexSrc.matchAll(/export \{([^}]+)\} from/g)].flatMap((m) => m[1].split(",").map((s) => s.trim())).filter(Boolean);
    expect(names.length).toBeGreaterThan(15);
    expect(names.filter((n) => !api.includes(n))).toEqual([]);
  });

  it("documents every attribute", () => {
    const attrs = /const ATTRS = \[([\s\S]*?)\] as const/.exec(elementSrc)![1].match(/"([a-z-]+)"/g)!.map((s) => s.slice(1, -1));
    expect(attrs.length).toBeGreaterThan(20);
    expect(attrs.filter((a) => !configuration.includes(`| \`${a}\``))).toEqual([]);
  });

  it("documents every event", () => {
    const events = /export interface ChartEvents \{([\s\S]*?)\n\}/.exec(chartSrc)![1].match(/^  (\w+):/gm)!.map((s) => s.trim().slice(0, -1));
    expect(events.filter((e) => !api.includes(`tl-${e}`))).toEqual([]);
    expect(api).toContain("tl-fullscreenchange");
  });
});

describe("docs links", () => {
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(docs)) files[k.replace("../docs/", "docs/")] = v;
  for (const [k, v] of Object.entries(root)) files[k.replace("../", "")] = v;
  const headings = (md: string) => new Set(md.replace(/```[\s\S]*?```/g, "").split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, ""))));

  it("every relative link and anchor points somewhere real", () => {
    const broken: string[] = [];
    for (const [file, md] of Object.entries(files)) {
      const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
      for (const m of md.replace(/```[\s\S]*?```/g, "").matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = m[1];
        if (/^(https?:|mailto:)/.test(href)) continue;
        const [path, anchor] = href.split("#");
        let target = file;
        if (path) {
          if (!path.endsWith(".md")) continue; // folders and source files are checked by GitHub, not here
          const parts = (dir + path).split("/");
          const out: string[] = [];
          for (const p of parts) { if (p === "..") out.pop(); else if (p !== ".") out.push(p); }
          target = out.join("/");
        }
        if (!(target in files)) { broken.push(`${file}: ${href} (no such page)`); continue; }
        if (anchor && !headings(files[target]).has(anchor)) broken.push(`${file}: ${href} (no such heading)`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("Claude Code skill and plugin", () => {
  const skill = import.meta.glob<string>("../plugins/tickline/skills/chart/*.md", { query: "?raw", import: "default", eager: true });
  const reference = skill["../plugins/tickline/skills/chart/reference.md"];
  const json = import.meta.glob<string>(["../package.json", "../mcp/package.json", "../plugins/tickline/.claude-plugin/plugin.json"], { query: "?raw", import: "default", eager: true });

  it("the skill's reference lists every public member of Chart and <trade-chart>", () => {
    const names = [...publicMembers(chartSrc, "Chart"), ...publicMembers(elementSrc, "TradeChartElement")];
    expect([...new Set(names)].filter((n) => !reference.includes(`\`${n}`) && !reference.includes(` ${n}`))).toEqual([]);
  });

  it("the plugin, the package and the MCP server have the same version", () => {
    const versions = Object.values(json).map((s) => JSON.parse(s).version);
    expect(new Set(versions).size).toBe(1);
  });
});
