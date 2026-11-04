// @vitest-environment happy-dom
// Animation timing, zoom features, paged history and long-history performance.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Chart } from "../src/chart";
import { heikinAshi } from "../src/data";
import { parseSpan } from "../src/time";
import type { Candle } from "../src/types";

beforeAll(() => {
  const noop = () => undefined;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === "measureText" ? () => ({ width: 10 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: noop }) : noop),
    set: (t, k, v) => { t[k as string] = v; return true; },
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
});

// a clock the tests move by hand
let clock = 1000;
const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
afterEach(() => { clock += 100000; });

const MIN = 60_000;
const T = Date.UTC(2026, 10, 3, 12, 0);
const candles = (n: number, start = T, price = 100): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: start + i * MIN, open: price + Math.sin(i / 7), high: price + 2 + Math.sin(i / 7), low: price - 2 + Math.cos(i / 5), close: price + Math.cos(i / 5), volume: 1 + (i % 9) }));
const make = (opts = {}) => {
  const box = document.createElement("div");
  Object.defineProperty(box, "getBoundingClientRect", { value: () => ({ width: 800, height: 400, left: 0, top: 0, right: 800, bottom: 400 }) });
  document.body.append(box);
  return new Chart(box, opts);
};
type Internals = { frame: (t: number, f: boolean) => void; msPerPx: number; indicators: Map<string, unknown>; store: { length: number } };
const inner = (c: Chart) => c as unknown as Internals;
const frame = (c: Chart, advance = 0) => { clock += advance; inner(c).frame(clock, true); };
const span = (c: Chart) => c.visibleRange.to - c.visibleRange.from;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("animation", () => {
  it("zooms over animation.durations.zoom, and jumps with animate: false", () => {
    const c = make();
    c.setData(candles(400));
    frame(c);
    const before = span(c);
    c.zoomIn();
    frame(c, 1);
    expect(span(c)).toBeGreaterThan(before / 1.6 + 1); // still on its way
    frame(c, 300);
    expect(span(c)).toBeCloseTo(before / 1.6, -2);
    c.zoomOut({ animate: false });
    frame(c);
    expect(span(c)).toBeCloseTo(before, -2);
    c.destroy();
  });

  it("speed scales every duration", () => {
    const c = make({ animation: { speed: 2 } });
    c.setData(candles(400));
    frame(c);
    const before = span(c);
    c.zoomIn();
    frame(c, 130); // 250 ms at speed 1, 125 ms at speed 2
    expect(span(c)).toBeCloseTo(before / 1.6, -2);
    c.destroy();
  });

  it("uses a custom easing function and per-call durations", () => {
    const seen: number[] = [];
    const c = make({ animation: { easing: (t: number) => { seen.push(t); return t; } } });
    c.setData(candles(400));
    frame(c);
    const before = span(c);
    c.zoomOut({ duration: 1000 });
    frame(c, 500);
    // linear easing, halfway in time: halfway on the (logarithmic) zoom scale
    expect(span(c)).toBeCloseTo(before * Math.sqrt(1.6), -2);
    expect(seen.some((t) => t > 0.4 && t < 0.6)).toBe(true);
    c.destroy();
  });

  it("zooming again while a zoom animates continues from its target", () => {
    const c = make();
    c.setData(candles(400));
    frame(c);
    const before = span(c);
    c.zoomIn(); c.zoomIn();
    frame(c, 400);
    expect(span(c)).toBeCloseTo(before / 1.6 / 1.6, -2);
    c.destroy();
  });

  it("closing an indicator animates, but the API forgets it at once", () => {
    const c = make();
    c.setData(candles(200));
    const key = c.addIndicator("rsi");
    frame(c, 300);
    c.removeIndicator(key);
    expect(c.indicatorList).toEqual([]);
    expect(inner(c).indicators.size).toBe(1); // still closing
    frame(c, 400);
    expect(inner(c).indicators.size).toBe(0);
    c.destroy();
  });

  it("removed overlays leave the API at once while they fade", () => {
    const c = make();
    c.setData(candles(50));
    const id = c.addAlert({ price: 150 });
    c.removeOverlay(id);
    expect(c.alerts).toEqual([]);
    frame(c, 50);
    frame(c, 500);
    c.destroy();
  });

  it("animate: false turns everything off", () => {
    const c = make({ animate: false });
    c.setData(candles(400));
    frame(c);
    const before = span(c);
    c.zoomIn();
    frame(c);
    expect(span(c)).toBeCloseTo(before / 1.6, -2);
    c.destroy();
  });

  it("type changes, intro and new candles draw without errors mid-animation", () => {
    const c = make();
    c.setData(candles(120));
    frame(c, 100); // intro under way
    c.setType("line");
    frame(c, 100);
    c.setType("heikin-ashi");
    frame(c, 100);
    c.tick({ time: T + 120 * MIN + 5, price: 101 }); // a new candle
    frame(c, 100);
    c.playIntro();
    frame(c, 350);
    frame(c, 1000);
    expect(c.type).toBe("heikin-ashi");
    c.destroy();
  });
});

describe("zoom", () => {
  it("parses spans", () => {
    expect(parseSpan("30m")).toBe(30 * MIN);
    expect(parseSpan("4h")).toBe(4 * 60 * MIN);
    expect(parseSpan("1H")).toBe(60 * MIN);
    expect(parseSpan("1D")).toBe(24 * 60 * MIN);
    expect(parseSpan("1M")).toBe(30 * 24 * 60 * MIN);
    expect(parseSpan("1Y")).toBe(365 * 24 * 60 * MIN);
    expect(parseSpan("x")).toBeNull();
    expect(parseSpan("0h")).toBeNull();
  });

  it("zoomTo shows a span up to the live edge; All fits everything", () => {
    const c = make({ animate: false });
    c.setData(candles(2000));
    frame(c);
    c.zoomTo("4h");
    frame(c);
    // 4 h fill the chart left of the live candle (rightPadding 0.2 of the width stays empty)
    expect(span(c) * 0.8).toBeCloseTo(4 * 60 * MIN, -4);
    expect(c.isFollowing).toBe(true);
    c.zoomTo("All");
    frame(c);
    expect(span(c) * 0.8).toBeGreaterThan(1990 * MIN);
    expect(() => c.zoomTo("soon")).toThrow(/Unknown range/);
    c.destroy();
  });

  it("zoomTo stays within min and max visible candles", () => {
    const c = make({ animate: false });
    c.setData(candles(5000));
    c.zoomTo("1Y");
    frame(c);
    expect(span(c) / MIN).toBeLessThanOrEqual(3000 + 1);
    c.zoomTo("1m");
    frame(c);
    expect(span(c) / MIN).toBeGreaterThanOrEqual(12 - 0.01);
    c.destroy();
  });

  it("a price range set by hand stays until reset", () => {
    const c = make({ animate: false });
    c.setData(candles(100));
    frame(c);
    expect(c.autoScale).toBe(true);
    c.setPriceRange({ min: 50, max: 150 });
    frame(c);
    expect(c.priceRange).toEqual({ min: 50, max: 150 });
    expect(c.autoScale).toBe(false);
    c.resetZoom();
    frame(c);
    expect(c.autoScale).toBe(true);
    expect(c.priceRange.max).toBeLessThan(110);
    c.destroy();
  });

  it("caps fitContent at maxVisibleCandles so huge histories stay fast", () => {
    const c = make({ animate: false });
    c.setData(candles(20000));
    c.fitContent();
    frame(c);
    expect(span(c) / MIN).toBeLessThanOrEqual(3001);
    c.destroy();
  });
});

describe("paged history", () => {
  it("loads the first page into an empty chart, then older pages as the view nears the start", async () => {
    const asked: (number | null)[] = [];
    const all = candles(1200, T - 1000 * MIN);
    const c = make({ animate: false, history: { pageSize: 200 } });
    const states: string[] = [];
    c.on("historystate", (e) => states.push(e.state));
    c.setHistoryLoader(({ before, count }) => {
      asked.push(before);
      const older = before === null ? all : all.filter((k) => k.time < before);
      return Promise.resolve(older.slice(-count));
    });
    expect(c.historyState).toBe("loading");
    await flush();
    expect(c.data.length).toBe(200);
    expect(asked).toEqual([null]);
    // the view shows 60 candles: scroll to the oldest and the next page is asked for
    c.scrollToTime(c.data[0].time, 0);
    frame(c);
    expect(asked[1]).toBe(c.data[0].time);
    await flush();
    expect(c.data.length).toBe(400);
    expect(c.historyState).toBe("idle");
    expect(states).toEqual(["loading", "idle", "loading", "idle"]);
    c.destroy();
  });

  it("an empty page means the start of history; no more requests", async () => {
    let calls = 0;
    const c = make({ animate: false });
    c.setData(candles(30));
    c.setHistoryLoader(() => { calls++; return []; });
    frame(c);
    await flush();
    expect(c.historyState).toBe("end");
    frame(c); frame(c);
    expect(calls).toBe(1);
    c.destroy();
  });

  it("a failed page shows the error until retryHistory", async () => {
    let fail = true;
    const c = make({ animate: false });
    c.setData(candles(30));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    c.setHistoryLoader(({ before, count }) => (fail ? Promise.reject(new Error("offline")) : Promise.resolve(candles(count, before! - count * MIN))));
    frame(c);
    await flush();
    expect(c.historyState).toBe("error");
    frame(c);
    fail = false;
    c.retryHistory();
    frame(c);
    await flush();
    expect(c.historyState).toBe("idle");
    expect(c.data.length).toBe(530);
    warn.mockRestore();
    c.destroy();
  });

  it("requesthistory listeners can answer with respondWith", async () => {
    const c = make({ animate: false });
    c.setData(candles(30));
    c.on("requesthistory", (e) => e.respondWith(Promise.resolve(candles(e.count, e.before - e.count * MIN))));
    frame(c);
    expect(c.historyState).toBe("loading");
    await flush();
    expect(c.data.length).toBe(530);
    c.destroy();
  });

  it("drops answers that arrive after the timeframe changed", async () => {
    let resolve: (v: Candle[]) => void = () => undefined;
    const c = make({ animate: false });
    c.setData(candles(30));
    c.setHistoryLoader(({ before }) => (before === null ? [] : new Promise<Candle[]>((r) => { resolve = r; })));
    frame(c);
    c.setTimeframe("5m");
    resolve(candles(100, T - 100 * MIN));
    await flush();
    expect(c.data.length).toBe(0); // the 1m page was not added to the 5m chart
    c.destroy();
  });

  it("keeps at most history.maxCandles, dropping the oldest out of view", () => {
    const c = make({ animate: false, history: { maxCandles: 1000, request: false } });
    c.setData(candles(3000));
    frame(c);
    expect(inner(c).store.length).toBe(1000);
    expect(c.data[c.data.length - 1].time).toBe(T + 2999 * MIN);
    c.destroy();
  });
});

describe("long histories", () => {
  it("windowed indicators match the full computation in view", () => {
    const data = candles(30000);
    const full = make({ animate: false, history: { indicatorWindow: 0 } });
    const win = make({ animate: false, history: { indicatorWindow: 20000 } });
    for (const c of [full, win]) { c.setData(data); c.addIndicator("sma", { period: 20 }); c.addIndicator("ema", { period: 50 }); c.addIndicator("rsi"); frame(c); }
    type Out = { out: { lines: { values: ArrayLike<number> }[] }; off: number };
    const at = (c: Chart, key: string, i: number) => {
      const ind = inner(c).indicators.get(key);
      const o = (c as unknown as { output: (x: unknown) => Out }).output(ind);
      return o.out.lines[0].values[i - o.off];
    };
    const keys = (c: Chart) => c.indicatorList.map((i) => i.key);
    for (const i of [29999, 29990, 29950]) {
      keys(full).forEach((k, n) => expect(at(win, keys(win)[n], i)).toBeCloseTo(at(full, k, i), 6));
    }
    full.destroy(); win.destroy();
  });

  it("Heikin-Ashi updates at the end match a full recomputation", () => {
    const c = make({ animate: false, type: "heikin-ashi" });
    c.setData(candles(500));
    frame(c);
    for (let i = 0; i < 20; i++) c.tick({ time: T + 500 * MIN + i * 20_000, price: 100 + i / 10 });
    frame(c);
    const ha = (c as unknown as { heikin: () => Candle[] }).heikin();
    const ref = heikinAshi(c.data);
    expect(ha.length).toBe(ref.length);
    expect(ha[ha.length - 1]).toEqual(ref[ref.length - 1]);
    expect(ha[ha.length - 3]).toEqual(ref[ref.length - 3]);
    c.destroy();
  });

  it("1,000,000 candles: ticks and frames stay fast", () => {
    nowSpy.mockRestore(); // real time for this one
    const n = 1_000_000;
    const start = Date.now() - n * MIN;
    const data = Array.from({ length: n }, (_, i) => ({ time: start + i * MIN, open: 100, high: 101, low: 99, close: 100 + (i % 7) / 10 }));
    const c = make({ animate: false });
    c.setData(data);
    c.addIndicator("sma", { period: 20 });
    c.addIndicator("macd");
    c.addIndicator("volume");
    const f = () => (c as unknown as Internals).frame(performance.now(), true);
    f();
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) { c.tick({ time: Date.now() + i, price: 100 + i / 100 }); f(); }
    const perFrame = (performance.now() - t0) / 20;
    expect(perFrame).toBeLessThan(25);
    c.destroy();
  });
});
