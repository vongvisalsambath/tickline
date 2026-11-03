import { describe, expect, it } from "vitest";
import { bucketStart, formatCountdown, formatTime, nextBucket, parseTimeframe, timeTicks, MS } from "../src/time";
import { autoPrecision, formatPrice, niceStep, priceTicks, splitEmphasis, stepDecimals } from "../src/price";
import { CandleStore, heikinAshi } from "../src/data";

const T0 = Date.UTC(2026, 10, 3, 20, 7, 30); // Tue 2026-11-03 20:07:30 UTC

describe("timeframes", () => {
  it("parses the supported forms", () => {
    expect(parseTimeframe("5s").ms).toBe(5000);
    expect(parseTimeframe("15m").ms).toBe(15 * MS.MIN);
    expect(parseTimeframe("4h").ms).toBe(4 * MS.HOUR);
    expect(parseTimeframe("1d").unit).toBe("d");
    expect(parseTimeframe("1M").unit).toBe("M");
  });
  it("rejects nonsense", () => {
    for (const bad of ["", "1x", "m", "0m", "-1m", "1.5m"]) expect(() => parseTimeframe(bad)).toThrow();
  });
  it("buckets on round boundaries", () => {
    expect(bucketStart(T0, parseTimeframe("1m"))).toBe(Date.UTC(2026, 10, 3, 20, 7));
    expect(bucketStart(T0, parseTimeframe("15m"))).toBe(Date.UTC(2026, 10, 3, 20, 0));
    expect(bucketStart(T0, parseTimeframe("4h"))).toBe(Date.UTC(2026, 10, 3, 20, 0));
    expect(bucketStart(T0, parseTimeframe("1d"))).toBe(Date.UTC(2026, 10, 3));
  });
  it("weeks start on Monday and months on the 1st", () => {
    expect(new Date(bucketStart(T0, parseTimeframe("1w"))).getUTCDay()).toBe(1);
    expect(bucketStart(T0, parseTimeframe("1w"))).toBe(Date.UTC(2026, 10, 2));
    expect(bucketStart(T0, parseTimeframe("1M"))).toBe(Date.UTC(2026, 10, 1));
    expect(bucketStart(T0, parseTimeframe("3M"))).toBe(Date.UTC(2026, 9, 1));
    expect(nextBucket(Date.UTC(2026, 11, 1), parseTimeframe("1M"))).toBe(Date.UTC(2027, 0, 1));
  });
});

describe("time axis", () => {
  it("picks round steps at least the minimum gap apart", () => {
    const from = T0, to = T0 + 30 * MS.MIN;
    const ticks = timeTicks(from, to, 4 * MS.MIN);
    expect(ticks.length).toBeGreaterThan(3);
    for (const t of ticks) expect(t.time % (5 * MS.MIN)).toBe(0);
    expect(ticks[0].label).toBe("20:10");
  });
  it("shows seconds under a minute and dates at midnight", () => {
    expect(timeTicks(T0, T0 + 20_000, 4000).map((t) => t.label)).toEqual(["20:07:30", "20:07:35", "20:07:40", "20:07:45", "20:07:50"]);
    const day = timeTicks(Date.UTC(2026, 10, 3, 22), Date.UTC(2026, 10, 4, 2), MS.HOUR);
    expect(day.find((t) => t.major)?.label).toBe("4 Nov");
  });
  it("respects a time-zone offset", () => {
    expect(timeTicks(T0, T0 + 30 * MS.MIN, 4 * MS.MIN, 420)[0].label).toBe("03:10"); // UTC+7
  });
  it("uses months for very wide ranges", () => {
    const ticks = timeTicks(Date.UTC(2025, 0, 15), Date.UTC(2026, 0, 15), 40 * MS.DAY);
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks.every((t) => new Date(t.time).getUTCDate() === 1)).toBe(true);
  });
  it("formats countdowns", () => {
    expect(formatCountdown(42_000)).toBe("00:42");
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatTime(T0, "full")).toBe("2026-11-03 20:07:30");
  });
});

describe("prices", () => {
  it("chooses nice steps", () => {
    expect(niceStep(1, 5)).toBeCloseTo(0.2);
    expect(niceStep(0.0042, 4)).toBeCloseTo(0.001);
    expect(niceStep(870, 5)).toBe(200);
  });
  it("puts ticks on round values", () => {
    expect(priceTicks(1.1182, 1.1206, 5)).toEqual([1.1185, 1.119, 1.1195, 1.12, 1.1205]);
    expect(priceTicks(5, 5, 4)).toEqual([]);
  });
  it("knows decimals", () => {
    expect(stepDecimals(0.0005)).toBe(4);
    expect(stepDecimals(25)).toBe(0);
    expect(autoPrecision(68123.45)).toBe(2);
    expect(autoPrecision(1.11942)).toBe(5);
    expect(autoPrecision(0.443085)).toBe(6);
  });
  it("formats with separators and a real minus sign", () => {
    expect(formatPrice(68123.456, 2)).toBe("68,123.46");
    expect(formatPrice(-0.0032, 4)).toBe("−0.0032");
    expect(formatPrice(NaN, 2)).toBe("–");
  });
  it("splits the digits to emphasise", () => {
    expect(splitEmphasis("1.11942", 3)).toEqual(["1.11", "942"]);
    expect(splitEmphasis("68,123.45", 3)).toEqual(["68,12", "3.45"]);
    expect(splitEmphasis("0.443085", 4)).toEqual(["0.44", "3085"]);
    expect(splitEmphasis("7", 3)).toEqual(["", "7"]);
  });
});

describe("candle store", () => {
  const tf = parseTimeframe("1m");
  const m = (min: number) => Date.UTC(2026, 10, 3, 20, min);

  it("turns ticks into candles", () => {
    const s = new CandleStore(tf);
    s.tick({ time: m(0) + 1000, price: 10 });
    s.tick({ time: m(0) + 9000, price: 12 });
    s.tick({ time: m(0) + 30000, price: 9 });
    s.tick({ time: m(0) + 59000, price: 11, volume: 2 });
    expect(s.length).toBe(1);
    expect(s.last).toMatchObject({ time: m(0), open: 10, high: 12, low: 9, close: 11, volume: 2 });
    expect(s.tick({ time: m(1) + 1, price: 11.5 })).toBe("added");
    expect(s.last).toMatchObject({ time: m(1), open: 11.5, high: 11.5, low: 11.5, close: 11.5 });
  });
  it("ignores late and broken ticks", () => {
    const s = new CandleStore(tf);
    s.tick({ time: m(2), price: 10 });
    expect(s.tick({ time: m(1), price: 99 })).toBe("ignored");
    expect(s.tick({ time: m(2) + 5, price: NaN })).toBe("ignored");
    expect(s.last!.high).toBe(10);
  });
  it("sorts, re-buckets and merges history", () => {
    const s = new CandleStore(parseTimeframe("5m"));
    s.set([
      { time: m(6), open: 3, high: 4, low: 2, close: 3.5, volume: 1 },
      { time: m(1), open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
      { time: m(3), open: 1.5, high: 3, low: 1, close: 2, volume: 2 },
    ]);
    expect(s.all.map((c) => c.time)).toEqual([m(0), m(5)]);
    expect(s.at(0)).toMatchObject({ open: 1, high: 3, low: 0.5, close: 2, volume: 3 });
  });
  it("prepends only older candles", () => {
    const s = new CandleStore(tf);
    s.set([{ time: m(5), open: 1, high: 1, low: 1, close: 1 }]);
    const n = s.prepend([
      { time: m(3), open: 1, high: 1, low: 1, close: 1 },
      { time: m(4), open: 1, high: 1, low: 1, close: 1 },
      { time: m(5), open: 9, high: 9, low: 9, close: 9 },
    ]);
    expect(n).toBe(2);
    expect(s.all.map((c) => c.time)).toEqual([m(3), m(4), m(5)]);
    expect(s.last!.open).toBe(1);
  });
  it("finds candles by time", () => {
    const s = new CandleStore(tf);
    s.set([0, 1, 2, 5].map((i) => ({ time: m(i), open: i, high: i, low: i, close: i })));
    expect(s.indexAtOrAfter(m(3))).toBe(3);
    expect(s.candleAt(m(2) + 30_000)?.open).toBe(2);
    expect(s.candleAt(m(3) + 1)).toBeNull();
  });
  it("upserts whole candles", () => {
    const s = new CandleStore(tf);
    expect(s.upsert({ time: m(0), open: 1, high: 2, low: 1, close: 2 })).toBe("added");
    expect(s.upsert({ time: m(0) + 500, open: 1, high: 3, low: 1, close: 3 })).toBe("updated");
    expect(s.upsert({ time: m(-1), open: 1, high: 3, low: 1, close: 3 })).toBe("ignored");
    expect(s.last!.close).toBe(3);
  });
});

describe("heikin-ashi", () => {
  it("averages as defined", () => {
    const ha = heikinAshi([
      { time: 0, open: 10, high: 12, low: 9, close: 11 },
      { time: 1, open: 11, high: 13, low: 10, close: 12 },
    ]);
    expect(ha[0].close).toBeCloseTo(10.5);
    expect(ha[0].open).toBeCloseTo(10.5);
    expect(ha[1].open).toBeCloseTo(10.5);
    expect(ha[1].close).toBeCloseTo(11.5);
    expect(ha[1].high).toBe(13);
  });
});
