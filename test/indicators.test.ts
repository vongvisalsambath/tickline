import { describe, expect, it } from "vitest";
import { ema, getIndicator, parseIndicatorList, resolveParams, rsi, sma, stdev } from "../src/indicators";
import type { Candle } from "../src/types";

const candles = (closes: number[]): Candle[] => closes.map((c, i) => ({ time: i * 60_000, open: c, high: c, low: c, close: c, volume: i + 1 }));

describe("moving averages", () => {
  it("sma", () => {
    expect(Array.from(sma([1, 2, 3, 4, 5], 3))).toEqual([NaN, NaN, 2, 3, 4]);
  });
  it("ema is seeded with the sma and then smoothed", () => {
    const e = ema([2, 4, 6, 8, 10, 12], 3); // k = 0.5
    expect(Array.from(e.slice(0, 2))).toEqual([NaN, NaN]);
    expect(e[2]).toBeCloseTo(4);
    expect(e[3]).toBeCloseTo(6);
    expect(e[5]).toBeCloseTo(10);
  });
  it("ema skips leading gaps (as in MACD's signal line)", () => {
    const e = ema([NaN, NaN, 3, 3, 3, 3], 2);
    expect(e[3]).toBeCloseTo(3);
    expect(Number.isNaN(e[2])).toBe(true);
  });
  it("stdev", () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9], 8)[7]).toBeCloseTo(2);
  });
});

describe("rsi", () => {
  it("matches the classic worked example (StockCharts, 14 periods)", () => {
    const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
    const r = rsi(closes, 14);
    expect(Number.isNaN(r[13])).toBe(true);
    expect(r[14]).toBeCloseTo(70.46, 1);
    expect(r[15]).toBeCloseTo(66.25, 1);
    expect(r[19]).toBeGreaterThan(40);
    expect(r[19]).toBeLessThan(r[18]);
  });
  it("is 100 when prices only rise and 0 when they only fall", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100);
    expect(rsi([6, 5, 4, 3, 2, 1], 3)[5]).toBe(0);
  });
});

describe("built-in indicators", () => {
  const data = candles(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.1));

  it("bollinger bands wrap the basis", () => {
    const out = getIndicator("bb")!.compute(data, { period: 20, mult: 2 });
    const [up, mid, lo] = out.lines.map((l) => l.values);
    for (let i = 19; i < 60; i++) { expect(up[i]).toBeGreaterThan(mid[i]); expect(lo[i]).toBeLessThan(mid[i]); }
    expect(out.band).toEqual(expect.objectContaining({ upper: 0, lower: 2 }));
  });
  it("macd histogram is macd minus signal", () => {
    const out = getIndicator("macd")!.compute(data, { fast: 12, slow: 26, signal: 9 });
    const [macd, signal] = out.lines.map((l) => l.values);
    const h = out.histogram!.values;
    expect(Number.isFinite(h[40])).toBe(true);
    expect(h[40]).toBeCloseTo(macd[40] - signal[40]);
    expect(out.histogram!.up[40]).toBe(h[40] >= 0 ? 1 : 0);
  });
  it("volume bars follow candle direction", () => {
    const out = getIndicator("volume")!.compute([{ time: 0, open: 1, high: 2, low: 1, close: 2, volume: 5 }, { time: 1, open: 2, high: 2, low: 1, close: 1, volume: 7 }], {});
    expect(Array.from(out.histogram!.values)).toEqual([5, 7]);
    expect(Array.from(out.histogram!.up)).toEqual([1, 0]);
  });
  it("rsi pane has a fixed 0–100 range and 30/70 levels", () => {
    const out = getIndicator("rsi")!.compute(data, { period: 14 });
    expect(out.range).toEqual([0, 100]);
    expect(out.levels).toEqual([30, 70]);
  });
});

describe("parameters", () => {
  it("fills defaults and clamps", () => {
    const def = getIndicator("macd")!;
    expect(resolveParams(def)).toEqual({ fast: 12, slow: 26, signal: 9 });
    expect(resolveParams(def, [5])).toEqual({ fast: 5, slow: 26, signal: 9 });
    expect(resolveParams(getIndicator("sma")!, { period: 0 })).toEqual({ period: 1 });
  });
  it("parses the indicators attribute", () => {
    expect(parseIndicatorList("sma:20, EMA:50 ,bb:20:2, rsi, macd:12:26:9,volume,")).toEqual([
      { id: "sma", params: [20] }, { id: "ema", params: [50] }, { id: "bb", params: [20, 2] },
      { id: "rsi", params: [] }, { id: "macd", params: [12, 26, 9] }, { id: "volume", params: [] },
    ]);
  });
});
