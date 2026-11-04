// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { Chart } from "../src/chart";
import { defineTradeChart, TradeChartElement } from "../src/element";
import { syncCharts } from "../src/sync";
import { distToDrawing } from "../src/drawings";
import { applyOptions, defaultOptions } from "../src/options";

beforeAll(() => {
  const noop = () => undefined;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === "measureText" ? () => ({ width: 10 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: noop }) : noop),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  defineTradeChart();
});

const MIN = 60_000;
const T = Date.UTC(2026, 10, 3, 12, 0);
const candles = (n: number, price = 100) =>
  Array.from({ length: n }, (_, i) => ({ time: T + i * MIN, open: price, high: price + 1, low: price - 1, close: price, volume: 1 }));
const make = (opts = {}) => {
  const box = document.createElement("div");
  Object.defineProperty(box, "getBoundingClientRect", { value: () => ({ width: 800, height: 400, left: 0, top: 0, right: 800, bottom: 400 }) });
  document.body.append(box);
  return new Chart(box, opts);
};

describe("alerts", () => {
  it("fire once when the price crosses, in either direction", () => {
    const c = make();
    c.setData(candles(10));
    const fired: { price: number; direction: string }[] = [];
    c.on("alert", (a) => fired.push({ price: a.price, direction: a.direction }));
    c.addAlert({ price: 101 });
    c.addAlert({ price: 99, once: false });
    c.tick({ time: T + 9 * MIN + 1000, price: 100.5 });
    expect(fired).toEqual([]);
    c.tick({ time: T + 9 * MIN + 2000, price: 101.2 });
    expect(fired).toEqual([{ price: 101, direction: "up" }]);
    expect(c.alerts.map((a) => a.price)).toEqual([99]); // the one-off alert is gone
    c.tick({ time: T + 9 * MIN + 3000, price: 98.9 });
    c.tick({ time: T + 9 * MIN + 4000, price: 99.5 });
    c.tick({ time: T + 9 * MIN + 5000, price: 98 });
    expect(fired.filter((f) => f.price === 99).map((f) => f.direction)).toEqual(["down", "up", "down"]);
    c.destroy();
  });
});

describe("view", () => {
  it("setVisibleRange and scrollToTime stop following; follow: true keeps it", () => {
    const c = make();
    c.setData(candles(200));
    c.setVisibleRange({ from: T + 50 * MIN, to: T + 100 * MIN });
    expect(c.isFollowing).toBe(false);
    c.scrollToTime(T + 20 * MIN);
    expect(c.isFollowing).toBe(false);
    c.setVisibleRange({ from: T, to: T + 30 * MIN }, { follow: true });
    expect(c.isFollowing).toBe(true);
    c.destroy();
  });

  it("live position is a share of the screen, kept in range", () => {
    const o = applyOptions(defaultOptions(), { livePosition: { x: 0.5, y: 1.4 } });
    expect(o.livePosition).toEqual({ x: 0.5, y: 0.98 });
    expect(applyOptions(o, { livePosition: { x: null } }).livePosition).toEqual({ x: null, y: 0.98 });
  });
});

describe("state", () => {
  it("round-trips type, indicators, drawings, alerts and view", () => {
    const a = make();
    a.setData(candles(100));
    a.setType("hollow");
    a.addIndicator("rsi", { period: 21 }, { colors: ["#ff0000"] });
    a.addDrawing({ tool: "rect", points: [{ time: T, price: 99 }, { time: T + 10 * MIN, price: 101 }] });
    a.addAlert({ price: 105, label: "Target" });
    a.setVisibleRange({ from: T + 10 * MIN, to: T + 60 * MIN });
    const saved = JSON.parse(JSON.stringify(a.getState()));

    const b = make();
    b.setData(candles(100));
    b.setState(saved);
    expect(b.type).toBe("hollow");
    expect(b.indicatorList.map((i) => [i.id, i.params.period, i.style.colors?.[0]])).toEqual([["rsi", 21, "#ff0000"]]);
    expect(b.drawings.map((d) => d.tool)).toEqual(["rect"]);
    expect(b.alerts.map((x) => [x.price, x.label])).toEqual([[105, "Target"]]);
    expect(b.isFollowing).toBe(false);
    a.destroy(); b.destroy();
  });
});

describe("drawings", () => {
  it("duplicate makes an unlocked copy and selects it", () => {
    const c = make();
    c.setData(candles(50));
    const id = c.addDrawing({ tool: "horizontal", points: [{ time: T, price: 100 }], locked: true });
    const copy = c.duplicateDrawing(id)!;
    expect(c.drawings).toHaveLength(2);
    expect(c.selectedDrawing?.id).toBe(copy);
    expect(c.selectedDrawing?.locked).toBe(false);
    c.updateDrawing(copy, { hidden: true });
    expect(c.drawings.find((d) => d.id === copy)?.hidden).toBe(true);
    c.destroy();
  });

  it("rectangles and measures are hit inside and near the edge", () => {
    const pts = [{ x: 10, y: 10 }, { x: 110, y: 60 }];
    expect(distToDrawing("rect", pts, { x: 50, y: 30 }, 400, 300)).toBe(0);
    expect(distToDrawing("measure", pts, { x: 115, y: 30 }, 400, 300)).toBe(5);
    expect(distToDrawing("rect", pts, { x: 200, y: 200 }, 400, 300)).toBeGreaterThan(100);
  });
});

describe("syncCharts", () => {
  it("shares the crosshair and unlinks cleanly", () => {
    const a = make(), b = make();
    a.setData(candles(50)); b.setData(candles(50));
    const seen: (number | null)[] = [];
    const orig = b.setCrosshair.bind(b);
    b.setCrosshair = (t) => { seen.push(t); orig(t); };
    const unlink = syncCharts([a, b]);
    (a as unknown as { emit: (k: string, v: unknown) => void }).emit("crosshair", { time: T + 5 * MIN, price: 100, candle: null });
    (a as unknown as { emit: (k: string, v: unknown) => void }).emit("crosshair", null);
    expect(seen).toEqual([T + 5 * MIN, null]);
    unlink();
    a.destroy(); b.destroy();
  });

  it("needs elements to be in the page", () => {
    const el = document.createElement("trade-chart") as TradeChartElement;
    expect(() => syncCharts([el])).toThrow();
  });
});

describe("<trade-chart> extras", () => {
  it("reads live-position and watermark attributes", () => {
    document.body.innerHTML = '<trade-chart live-position="center" watermark="{symbol}"></trade-chart>';
    const el = document.body.firstElementChild as TradeChartElement;
    expect(el.options.livePosition).toEqual({ x: 0.5, y: 0.5 });
    expect(el.options.watermark.text).toBe("{symbol}");
    el.setAttribute("live-position", "0.8");
    expect(el.options.livePosition).toEqual({ x: 0.8, y: null });
    el.removeAttribute("live-position");
    expect(el.options.livePosition).toEqual({ x: null, y: null });
  });

  it("covers the page for full screen where the browser can't, and leaves it again", async () => {
    document.body.innerHTML = "<trade-chart></trade-chart>";
    const el = document.body.firstElementChild as TradeChartElement;
    const events: boolean[] = [];
    el.addEventListener("tl-fullscreenchange", (e) => events.push((e as CustomEvent).detail.fullscreen));
    await el.enterFullscreen();
    expect(el.isFullscreen).toBe(true);
    expect(el.hasAttribute("fullscreen")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    await el.exitFullscreen();
    expect(el.isFullscreen).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(events).toEqual([true, false]);
  });

  it("hides every button with controls=none, including image and full screen", () => {
    document.body.innerHTML = '<trade-chart controls="none"></trade-chart>';
    const root = (document.body.firstElementChild as TradeChartElement).shadowRoot!;
    expect(root.querySelector(".controls")!.classList.contains("off")).toBe(true);
  });
});

describe("shapes, layers and markers", () => {
  const live = (n: number) => {
    const end = Math.floor(Date.now() / MIN) * MIN;
    return Array.from({ length: n }, (_, i) => ({ time: end - (n - 1 - i) * MIN, open: 100, high: 101, low: 99, close: 100, volume: 1 }));
  };
  const frame = (c: Chart) => (c as unknown as { frame: (t: number, f: boolean) => void }).frame(performance.now(), true);

  it("adds, changes and removes shapes", () => {
    const c = make();
    c.setData(candles(50));
    const id = c.addShape({ type: "circle", points: [{ time: T + 10 * MIN, price: 100 }], radius: 12, fill: "rgba(0,0,0,.2)" });
    c.addShape({ type: "text", points: [{ time: T, price: 101 }], text: "Breakout", background: "#000" });
    expect(c.shapes.map((x) => x.type)).toEqual(["circle", "text"]);
    c.updateOverlay(id, { radius: 20 });
    expect(c.shapes[0].radius).toBe(20);
    frame(c); // draws without errors
    c.removeOverlay(id);
    expect(c.shapes).toHaveLength(1);
    c.destroy();
  });

  it("calls layers with screen helpers, and removes them", () => {
    const c = make();
    c.setData(candles(50));
    const seen: { w: number; x: number; n: number }[] = [];
    const remove = c.addLayer((_ctx, api) => seen.push({ w: api.width, x: api.timeToX(T + 49 * MIN), n: api.candles.length }));
    frame(c);
    expect(seen.length).toBe(1);
    expect(seen[0].w).toBeGreaterThan(0);
    expect(seen[0].n).toBeGreaterThan(0);
    remove();
    frame(c);
    expect(seen.length).toBe(1);
    c.destroy();
  });

  it("uses a custom live marker, and pulse: false turns the marker off", () => {
    const c = make({ animate: false }); // no intro: the marker shows on the first frame
    c.setData(live(30));
    const calls: boolean[] = [];
    c.setOptions({ lastPrice: { marker: (_ctx, info) => calls.push(info.live) } });
    frame(c);
    expect(calls).toEqual([true]);
    c.setOptions({ lastPrice: { pulse: false } });
    expect(c.options.lastPrice.marker).toBe("none");
    c.setOptions({ lastPrice: { marker: "radar" } });
    expect(c.options.lastPrice.pulse).toBe(true);
    for (const m of ["pulse", "ripple", "radar", "glow", "dot"] as const) { c.setOptions({ lastPrice: { marker: m } }); frame(c); }
    c.destroy();
  });

  it("turns screen positions into time and price and back", () => {
    const c = make();
    c.setData(candles(50));
    frame(c);
    const p = { time: T + 20 * MIN, price: 100.5 };
    const back = c.fromScreen(c.toScreen(p));
    expect(Math.abs(back.time - p.time)).toBeLessThan(1000);
    expect(back.price).toBeCloseTo(100.5, 6);
    c.destroy();
  });

  it("a placed text drawing fires drawingcreate", () => {
    const c = make();
    c.setData(candles(50));
    frame(c);
    const made: string[] = [];
    c.on("drawingcreate", (d) => made.push(d.tool));
    c.setDrawingTool("text");
    (c as unknown as { placePoint: (p: { x: number; y: number }) => void }).placePoint({ x: 200, y: 150 });
    expect(made).toEqual(["text"]);
    c.updateDrawing(c.drawings[0].id, { text: "Support" });
    expect(c.drawings[0].text).toBe("Support");
    c.destroy();
  });

  it("maps touches correctly when shown rotated", () => {
    const c = make();
    Object.defineProperty(c.canvas, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800 }) });
    const local = (e: { clientX: number; clientY: number }) => (c as unknown as { local: (e: unknown) => { x: number; y: number } }).local(e);
    expect(local({ clientX: 10, clientY: 20 })).toEqual({ x: 10, y: 20 });
    c.setRotation(90);
    // a touch near the top right of the screen is near the top left of the turned chart
    expect(local({ clientX: 390, clientY: 20 })).toEqual({ x: 20, y: 10 });
    c.destroy();
  });
});

describe("<trade-chart> full screen orientation", () => {
  it("turns the chart for landscape on a portrait screen that can't lock, and back", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    document.body.innerHTML = '<trade-chart fullscreen-orientation="landscape" live-marker="ripple"></trade-chart>';
    const el = document.body.firstElementChild as TradeChartElement;
    expect(el.options.ui.fullscreenOrientation).toBe("landscape");
    expect(el.options.lastPrice.marker).toBe("ripple");
    await el.enterFullscreen();
    expect(el.hasAttribute("rotated")).toBe(true);
    expect(el.chart!.screenRotation).toBe(90);
    await el.rotate(); // to portrait: no turning needed on a portrait screen
    expect(el.hasAttribute("rotated")).toBe(false);
    await el.exitFullscreen();
    expect(el.hasAttribute("rotated")).toBe(false);
    expect(el.chart!.screenRotation).toBe(0);
  });
});
