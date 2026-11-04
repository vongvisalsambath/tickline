// @vitest-environment happy-dom
// Hostile input: saved states, settings from attributes, and MCP snippet inputs.
import { beforeAll, describe, expect, it } from "vitest";
import { mergeDeep, defaultOptions } from "../src/options";
import { Chart } from "../src/chart";
import { cleanDrawing, MAX_DRAWINGS, MAX_DRAWING_TEXT } from "../src/drawings";
import { defineTradeChart } from "../src/element";
import { snippet, FRAMEWORKS } from "../mcp/src/knowledge";

beforeAll(() => {
  const noop = () => undefined;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === "measureText" ? () => ({ width: 10 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: noop }) : noop),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  defineTradeChart();
});

function chart(): Chart {
  const box = document.createElement("div");
  Object.defineProperty(box, "clientWidth", { value: 800 });
  Object.defineProperty(box, "clientHeight", { value: 400 });
  document.body.appendChild(box);
  return new Chart(box, { animate: false });
}

describe("settings from JSON", () => {
  it("a __proto__ key can't change the prototype of the merged settings, or of anything else", () => {
    const evil = JSON.parse('{ "__proto__": { "polluted": true, "grid": { "vertical": false } }, "constructor": { "prototype": { "polluted": true } } }');
    const out = mergeDeep(defaultOptions(), evil) as unknown as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((out.grid as { vertical: boolean }).vertical).toBe(true);
  });

  it("an options attribute with __proto__ changes nothing", () => {
    const el = document.createElement("trade-chart");
    el.setAttribute("options", '{ "__proto__": { "polluted": 1 }, "grid": { "vertical": false } }');
    document.body.appendChild(el);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    el.remove();
  });
});

describe("saved drawings", () => {
  const fb = { id: "x", color: "#fff" };
  it("only drawings that can be drawn are kept, field by field", () => {
    expect(cleanDrawing({ tool: "line", points: [{ time: 1, price: 2 }, { time: 3, price: 4 }] }, fb)).toMatchObject({ id: "x", tool: "line", color: "#fff" });
    expect(cleanDrawing({ tool: "__proto__", points: [{ time: 1, price: 2 }] }, fb)).toBeNull();
    expect(cleanDrawing({ tool: "constructor", points: [{ time: 1, price: 2 }, { time: 1, price: 2 }] }, fb)).toBeNull();
    expect(cleanDrawing({ tool: "line", points: [{ time: 1, price: NaN }, { time: 3, price: 4 }] }, fb)).toBeNull();
    expect(cleanDrawing({ tool: "line", points: [{ time: "1", price: 2 }, { time: 3, price: 4 }] }, fb)).toBeNull();
    expect(cleanDrawing({ tool: "line", points: [{ time: 1, price: 2 }] }, fb)).toBeNull();
    expect(cleanDrawing({ tool: "line", points: "nope" }, fb)).toBeNull();
    expect(cleanDrawing(null, fb)).toBeNull();
    const d = cleanDrawing({ tool: "text", points: [{ time: 1, price: 2 }], text: "x".repeat(10_000), fontSize: 1e9, width: -5, style: "wavy", locked: "yes", color: 5, extra: "kept?" }, fb)!;
    expect(d.text!.length).toBe(MAX_DRAWING_TEXT);
    expect([d.fontSize, d.width, d.style, d.locked, d.color]).toEqual([96, 0.5, undefined, false, "#fff"]);
    expect("extra" in d).toBe(false);
  });

  it("setState keeps only sound drawings, alerts and views, and a bounded number", () => {
    const c = chart();
    const t0 = Date.UTC(2026, 0, 1);
    c.setData(Array.from({ length: 50 }, (_, i) => ({ time: t0 + i * 60_000, open: 1, high: 2, low: 0.5, close: 1.5 })));
    const good = { tool: "horizontal", points: [{ time: t0, price: 1 }], color: "#f00" };
    c.setState({
      drawings: [good, { tool: "nope", points: [] }, ...Array.from({ length: MAX_DRAWINGS + 100 }, () => good)] as never,
      alerts: [{ price: 1.2 }, { price: Infinity }, { price: "1" }, null, { price: 1.3, label: "y".repeat(500) }] as never,
      view: { following: false, from: -Infinity, to: Infinity },
      type: "<script>" as never,
    });
    expect(c.drawings.length).toBe(MAX_DRAWINGS);
    expect(new Set(c.drawings.map((d) => d.id)).size).toBe(MAX_DRAWINGS);
    expect(c.alerts.map((a) => a.price)).toEqual([1.2, 1.3]);
    expect(c.alerts[1].label!.length).toBe(100);
    expect(c.options.type).toBe("candles");
    c.destroy();
  });

  it("addDrawing and updateDrawing refuse what can't be drawn", () => {
    const c = chart();
    expect(() => c.addDrawing({ tool: "line", points: [{ time: 1, price: NaN }, { time: 2, price: 1 }] })).toThrow(/finite/);
    const id = c.addDrawing({ tool: "line", points: [{ time: 1, price: 1 }, { time: 2, price: 1 }] });
    c.updateDrawing(id, { width: 1e9, text: "z".repeat(5000), id: "hijack", points: [] } as never);
    const d = c.drawings.find((x) => x.id === id)!;
    expect([d.width, d.text!.length, d.points.length]).toEqual([20, MAX_DRAWING_TEXT, 2]);
    c.destroy();
  });
});

describe("the element", () => {
  it("drawing-colour swatches can only be colours", () => {
    const el = document.createElement("trade-chart");
    el.setAttribute("options", JSON.stringify({ drawings: { colors: ["red", "red;background-image:url(https://evil.example/t)", "\"><img src=x onerror=alert(1)>"] } }));
    document.body.appendChild(el);
    const root = el.shadowRoot!;
    expect(root.querySelectorAll("img").length).toBe(0);
    const styles = [...root.querySelectorAll<HTMLElement>(".swatch")].map((b) => b.getAttribute("style") ?? "");
    expect(styles.join(" ")).not.toContain("url(");
    el.remove();
  });

  it("drawing tools named after Object's own keys don't render", () => {
    const el = document.createElement("trade-chart");
    el.setAttribute("options", JSON.stringify({ ui: { drawingTools: ["line", "constructor", "toString", "__proto__"] } }));
    document.body.appendChild(el);
    const tools = [...el.shadowRoot!.querySelectorAll<HTMLElement>("[data-tool]")].map((b) => b.dataset.tool);
    expect(tools).toEqual(["line"]);
    el.remove();
  });
});

describe("MCP snippets", () => {
  const hostile = [
    { timeframe: "1m`;require('child_process').exec('x');`" },
    { timeframe: "1m${process.exit()}" },
    { indicators: "sma:1]);fetch('//evil');//" },
    { indicators: "sma:20\"><script>alert(1)</script>" },
    { symbol: "{{constructor.constructor('alert(1)')()}}" },
    { symbol: "BTC</script><script>alert(1)</script>" },
    { symbol: "{alert(1)}" },
    { symbol: "x".repeat(41) },
  ];
  it.each(hostile)("refuses input that could change the code: %o", (bad) => {
    for (const framework of FRAMEWORKS) expect(() => snippet({ framework, ...bad })).toThrow(/isn't allowed/);
  });

  it("ordinary inputs still work", () => {
    const out = snippet({ framework: "angular", symbol: "BTC/USDT", timeframe: "15m", indicators: "sma:20, bb:20:2.5, volume" });
    expect(out.files[0].code).toContain('symbol="BTC/USDT"');
  });

  it("a settings string can't close the script it's printed in", () => {
    const out = snippet({ framework: "html", options: { labels: { live: "</script><script>alert(1)</script>" } } });
    const code = out.files.map((f) => f.code).join("\n");
    expect(code).not.toContain("</script><script>alert(1)");
    expect(code).toContain("\\u003c/script>");
  });
});
