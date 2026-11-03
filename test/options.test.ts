// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { applyOptions, defaultOptions, mergeDeep } from "../src/options";
import { Chart } from "../src/chart";
import { defineTradeChart, TradeChartElement } from "../src/element";

// happy-dom has no canvas drawing; a do-nothing 2D context is enough to run the chart.
beforeAll(() => {
  const noop = () => undefined;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === "measureText" ? () => ({ width: 10 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: noop }) : noop),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  defineTradeChart();
});

describe("settings", () => {
  it("merges groups, replaces arrays and functions, skips undefined", () => {
    const base = { a: { x: 1, y: 2 }, list: [1, 2], f: () => 1 };
    const f2 = () => 2;
    const out = mergeDeep(base, { a: { y: 3 }, list: [9], f: f2, b: undefined });
    expect(out).toEqual({ a: { x: 1, y: 3 }, list: [9], f: f2 });
    expect(base.a.y).toBe(2); // the original is untouched
  });

  it("applies shorthands to their groups", () => {
    const o = applyOptions(defaultOptions(), { priceLine: "full", countdown: false, rightPadding: 0.3, minVisibleCandles: 20, emphasisDigits: 2, animate: false });
    expect(o.lastPrice).toMatchObject({ line: "full", countdown: false, emphasisDigits: 2 });
    expect(o.timeScale).toMatchObject({ rightPadding: 0.3, minVisibleCandles: 20 });
    expect(o.animation.enabled).toBe(false);
  });

  it("keeps values in range", () => {
    const o = applyOptions(defaultOptions(), { fps: 0, series: { candleWidth: 5 }, timeScale: { rightPadding: -1, minVisibleCandles: 50, maxVisibleCandles: 10 }, interaction: { zoomStep: 1 } });
    expect(o.fps).toBe(1);
    expect(o.series.candleWidth).toBe(1);
    expect(o.timeScale.rightPadding).toBe(0);
    expect(o.timeScale.maxVisibleCandles).toBe(50);
    expect(o.interaction.zoomStep).toBeGreaterThan(1);
  });

  it("merges partial labels, including tool names", () => {
    const o = applyOptions(defaultOptions(), { labels: { live: "En vivo", tools: { fib: "Fibonacci" } } });
    expect(o.labels.live).toBe("En vivo");
    expect(o.labels.tools.fib).toBe("Fibonacci");
    expect(o.labels.tools.trend).toBe("Trend line");
  });
});

describe("Chart settings", () => {
  const make = (opts = {}) => {
    const box = document.createElement("div");
    document.body.append(box);
    return new Chart(box, opts);
  };

  it("returns every setting, and a copy", () => {
    const c = make({ grid: { vertical: false }, locale: "de-DE" });
    const o = c.options;
    expect(o.grid).toEqual({ horizontal: true, vertical: false });
    expect(o.locale).toBe("de-DE");
    o.grid.horizontal = false;
    expect(c.options.grid.horizontal).toBe(true);
    c.destroy();
  });

  it("setOptions changes only what's given", () => {
    const c = make({ crosshair: { mode: "free" } });
    c.setOptions({ crosshair: { style: "dotted" }, timeframe: "5m" });
    expect(c.options.crosshair).toEqual({ mode: "free", style: "dotted", labels: true });
    expect(c.timeframe).toBe("5m");
    c.destroy();
  });

  it("theme overrides sit on a preset", () => {
    const c = make({ theme: { base: "light", up: "#00aa00" } });
    expect(c.currentTheme.up).toBe("#00aa00");
    expect(c.currentTheme.background).toBe("#ffffff");
    c.destroy();
  });

  it("indicator styles are kept and reported", () => {
    const c = make();
    const key = c.addIndicator("macd", [12, 26, 9], { colors: ["#111111", "#222222"], height: 0.3 });
    expect(c.indicatorList[0].style).toEqual({ colors: ["#111111", "#222222"], height: 0.3 });
    c.updateIndicator(key, undefined, { width: 2 });
    expect(c.indicatorList[0].style.width).toBe(2);
    expect(c.indicatorList[0].params).toEqual({ fast: 12, slow: 26, signal: 9 });
    c.destroy();
  });

  it("new drawings use the drawing settings", () => {
    const c = make({ drawings: { color: "#123456", width: 3, style: "dashed" } });
    c.addDrawing({ tool: "horizontal", points: [{ time: 0, price: 1 }] });
    expect(c.drawings[0]).toMatchObject({ color: "#123456", width: 3, style: "dashed" });
    c.destroy();
  });
});

describe("<trade-chart> settings", () => {
  const mount = (html: string) => {
    document.body.innerHTML = html;
    return document.body.firstElementChild as TradeChartElement;
  };

  it("reads attributes, and removing one restores the default", () => {
    const el = mount('<trade-chart grid="horizontal" crosshair="free" legend="false" font-size="13" locale="fr-FR" drawing-tools="trend, fib"></trade-chart>');
    const o = el.options;
    expect(o.grid).toEqual({ horizontal: true, vertical: false });
    expect(o.crosshair.mode).toBe("free");
    expect(o.legend.visible).toBe(false);
    expect(o.layout.fontSize).toBe(13);
    expect(o.locale).toBe("fr-FR");
    expect(o.ui.drawingTools).toEqual(["trend", "fib"]);
    expect(el.shadowRoot!.querySelectorAll("[data-tool]").length).toBe(2);
    el.removeAttribute("grid");
    expect(el.options.grid).toEqual({ horizontal: true, vertical: true });
  });

  it("takes every setting as JSON in the options attribute", () => {
    const el = mount(`<trade-chart options='{"priceScale":{"margin":0.2},"labels":{"live":"Live now"},"theme":{"base":"light","accent":"#ff6600"}}'></trade-chart>`);
    expect(el.options.priceScale.margin).toBe(0.2);
    expect(el.shadowRoot!.querySelector(".live")!.textContent).toBe("Live now");
    expect(el.currentTheme.accent).toBe("#ff6600");
    expect(el.currentTheme.background).toBe("#ffffff");
  });

  it("keeps settings given before it's in the page", () => {
    const el = document.createElement("trade-chart");
    el.setOptions({ timeScale: { rightPadding: 0.05 }, ui: { zoomButtons: false } });
    expect(el.options.timeScale.rightPadding).toBe(0.05);
    document.body.replaceChildren(el);
    expect(el.options.timeScale.rightPadding).toBe(0.05);
    expect(el.shadowRoot!.querySelector('[data-a="in"]')!.classList.contains("off")).toBe(true);
    expect(el.shadowRoot!.querySelector('[data-a="image"]')!.classList.contains("off")).toBe(false);
  });

  it("translates the controls", () => {
    const el = mount("<trade-chart></trade-chart>");
    el.options = { labels: { zoomIn: "Vergrößern", delete: "Löschen", tools: { line: "Linie" } }, drawings: { colors: ["#000000", "#ffffff"] } };
    const root = el.shadowRoot!;
    expect(root.querySelector('[data-a="in"]')!.getAttribute("aria-label")).toBe("Vergrößern");
    expect(root.querySelector("[data-del]")!.textContent).toBe("Löschen");
    expect(root.querySelector('[data-tool="line"]')!.getAttribute("title")).toBe("Linie");
    expect(root.querySelectorAll(".swatch").length).toBe(2);
  });

  it('controls="none" hides every built-in control', () => {
    const el = mount('<trade-chart controls="none"></trade-chart>');
    const root = el.shadowRoot!;
    expect(root.querySelector(".controls")!.classList.contains("off")).toBe(true);
    expect(root.querySelector(".tools")!.classList.contains("off")).toBe(true);
    el.removeAttribute("controls");
    expect(root.querySelector(".tools")!.classList.contains("off")).toBe(false);
  });
});
