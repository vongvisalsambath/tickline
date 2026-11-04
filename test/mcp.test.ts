import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getSection, indicators, listOptions, searchDocs, snippet, validateOptions, FRAMEWORKS } from "../mcp/src/knowledge";

describe("MCP knowledge", () => {
  it("finds docs sections", () => {
    expect(searchDocs("full screen")[0].text.toLowerCase()).toContain("full screen");
    expect(searchDocs("translate labels").some((s) => s.id === "configuration/labels")).toBe(true);
    expect(getSection("configuration/livePosition")?.text).toContain("livePosition.x");
  });

  it("lists every setting in a group with defaults and descriptions", () => {
    const grid = listOptions("grid");
    expect(grid).toEqual([
      { path: "grid.horizontal", default: true, description: "A line at each price label" },
      { path: "grid.vertical", default: true, description: "A line at each time label" },
    ]);
    const all = listOptions();
    expect(all.length).toBeGreaterThan(80);
    // every setting is described in docs/configuration.md
    const undocumented = all.filter((o) => !o.description && !o.path.startsWith("labels.") && !o.path.startsWith("format.") && o.path !== "theme");
    expect(undocumented.map((o) => o.path)).toEqual([]);
  });

  it("validates settings", () => {
    expect(validateOptions({ grid: { vertical: false }, crosshair: { mode: "free" }, livePosition: { x: 0.5, y: null } }).valid).toBe(true);
    const bad = validateOptions({ grdi: {}, crosshair: { mode: "sticky" }, series: { candleWidth: "wide" }, ui: { drawingTools: ["line", "hexagon"] }, format: { price: "x" } });
    expect(bad.valid).toBe(false);
    expect(bad.problems.map((p) => p.path).sort()).toEqual(["crosshair.mode", "format.price", "grdi", "series.candleWidth", "ui.drawingTools"]);
    const clamped = validateOptions({ series: { candleWidth: 3 } });
    expect(clamped.warnings).toEqual([{ path: "series.candleWidth", message: "Out of range: the chart will use 1." }]);
    expect(validateOptions({ theme: { base: "light", up: "#16a34a", nope: "#000" } }).problems.map((p) => p.path)).toEqual(["theme.nope"]);
    expect(validateOptions({ timeframe: "7x" }).valid).toBe(false);
  });

  it("lists indicators with the attribute form", () => {
    expect(indicators().find((i) => i.id === "macd")?.attribute).toBe("macd:12:26:9");
  });

  it("writes code for every framework", () => {
    for (const framework of FRAMEWORKS) {
      const out = snippet({ framework, options: { grid: { vertical: false } }, dataSource: "binance-demo" });
      const code = out.files.map((f) => f.code).join("\n");
      expect(code).toContain("trade-chart".slice(0, framework === "javascript" ? 0 : 11));
      expect(code).toContain(framework === "blazor" ? "tickline.setData" : "setData");
      expect(code).toMatch(/vertical/);
    }
    expect(snippet({ framework: "html" }).files[0].code).toContain("/api/candles");
  });
});

describe("MCP server over stdio", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command: "node", args: ["mcp/dist/tickline-mcp.js"] }));
  }, 20_000);
  afterAll(async () => { await client?.close(); });

  it("lists its tools, resources and prompt", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(["get_doc", "get_snippet", "list_indicators", "list_options", "search_docs", "validate_options"]);
    expect((await client.listResources()).resources.map((r) => r.uri).sort()).toEqual(["tickline://docs/configuration", "tickline://docs/readme"]);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(["add_chart"]);
  });

  it("answers tool calls", async () => {
    const r = await client.callTool({ name: "validate_options", arguments: { options: { lastPrice: { line: "middle" } } } });
    const body = JSON.parse((r.content as { text: string }[])[0].text);
    expect(body.valid).toBe(false);
    expect(body.problems[0].path).toBe("lastPrice.line");

    const code = await client.callTool({ name: "get_snippet", arguments: { framework: "react", symbol: "ETH/USDT", dataSource: "binance-demo" } });
    expect((code.content as { text: string }[])[0].text).toContain("ethusdt@aggTrade");

    const bad = await client.callTool({ name: "get_snippet", arguments: { framework: "vue", options: { grid: 3 } } });
    expect(bad.isError).toBe(true);
  });

  it("serves the docs as resources", async () => {
    const r = await client.readResource({ uri: "tickline://docs/configuration" });
    expect((r.contents[0] as { text: string }).text).toContain("# Configuration");
  });
});
