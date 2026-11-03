// Candle storage: load history, prepend older history, and turn live ticks into candles.
import type { Candle, Tick } from "./types";
import { bucketStart, nextBucket, type ParsedTimeframe } from "./time";

export class CandleStore {
  private candles: Candle[] = [];
  /** Last tick time accepted (ticks older than this are ignored). */
  lastTickTime = -Infinity;

  constructor(public tf: ParsedTimeframe) {}

  get length(): number { return this.candles.length; }
  get all(): readonly Candle[] { return this.candles; }
  get last(): Candle | undefined { return this.candles[this.candles.length - 1]; }
  get first(): Candle | undefined { return this.candles[0]; }
  at(i: number): Candle { return this.candles[i]; }

  /** Replaces all candles. Sorts, re-buckets to this timeframe and merges duplicates. */
  set(candles: readonly Candle[]): void {
    this.candles = this.normalise(candles);
    const last = this.last;
    this.lastTickTime = last ? last.time : -Infinity;
  }

  /** Adds older candles before the current first one (from a history request). Returns how many were added. */
  prepend(candles: readonly Candle[]): number {
    const first = this.first;
    const older = this.normalise(candles).filter((c) => !first || c.time < first.time);
    this.candles = older.concat(this.candles);
    return older.length;
  }

  /**
   * Adds or replaces one whole candle (e.g. from a kline stream). A candle for the current
   * bucket replaces it; a newer one is appended; an older one is ignored.
   */
  upsert(c: Candle): "updated" | "added" | "ignored" {
    const t = bucketStart(c.time, this.tf);
    const last = this.last;
    const candle = { ...c, time: t };
    if (!last || t > last.time) { this.candles.push(candle); this.lastTickTime = Math.max(this.lastTickTime, c.time); return "added"; }
    if (t === last.time) { this.candles[this.candles.length - 1] = candle; return "updated"; }
    return "ignored";
  }

  /** Applies a tick: grows the current candle or starts a new one. */
  tick(t: Tick): "updated" | "added" | "ignored" {
    if (!Number.isFinite(t.price) || !Number.isFinite(t.time) || t.time < this.lastTickTime) return "ignored";
    this.lastTickTime = t.time;
    const b = bucketStart(t.time, this.tf);
    const last = this.last;
    if (last && b === last.time) {
      last.high = Math.max(last.high, t.price);
      last.low = Math.min(last.low, t.price);
      last.close = t.price;
      if (t.volume) last.volume = (last.volume ?? 0) + t.volume;
      return "updated";
    }
    if (last && b < last.time) return "ignored";
    this.candles.push({ time: b, open: t.price, high: t.price, low: t.price, close: t.price, volume: t.volume ?? 0 });
    return "added";
  }

  /** Index of the first candle whose time is >= t (binary search). */
  indexAtOrAfter(t: number): number {
    let lo = 0, hi = this.candles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.candles[mid].time < t) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /** The candle containing time t, if any. */
  candleAt(t: number): Candle | null {
    const b = bucketStart(t, this.tf);
    const i = this.indexAtOrAfter(b);
    const c = this.candles[i];
    return c && c.time === b ? c : null;
  }

  /** End time of a candle. */
  endOf(c: Candle): number { return nextBucket(c.time, this.tf); }

  private normalise(input: readonly Candle[]): Candle[] {
    const out: Candle[] = [];
    const sorted = [...input].filter(validCandle).sort((a, b) => a.time - b.time);
    for (const c of sorted) {
      const t = bucketStart(c.time, this.tf);
      const prev = out[out.length - 1];
      if (prev && prev.time === t) {
        // several finer candles in one bucket: merge them
        prev.high = Math.max(prev.high, c.high);
        prev.low = Math.min(prev.low, c.low);
        prev.close = c.close;
        prev.volume = (prev.volume ?? 0) + (c.volume ?? 0);
      } else out.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 });
    }
    return out;
  }
}

function validCandle(c: Candle): boolean {
  return c != null && [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite);
}

/** Heikin-Ashi candles from regular ones. */
export function heikinAshi(src: readonly Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const prev = out[i - 1];
    const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    out.push({ time: c.time, open, close, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), volume: c.volume });
  }
  return out;
}
