// Indicators: pure calculations over candles, plus how each one is drawn (on the price chart or in its own pane).
import type { Candle } from "./types";

/** One output line, aligned with the candles (NaN where there isn't enough data yet). */
export interface IndicatorLine {
  name: string;
  values: Float64Array;
  color: string;
  width?: number;
}

export interface IndicatorOutput {
  lines: IndicatorLine[];
  /** Bars from zero (MACD histogram, volume). `up` decides the colour per bar. */
  histogram?: { values: Float64Array; up: Uint8Array; upColor: string; downColor: string };
  /** A filled band between two lines (Bollinger Bands), by line index. */
  band?: { upper: number; lower: number; color: string };
  /** Dashed reference levels (RSI 30/70, MACD 0). */
  levels?: number[];
  /** A fixed value range for the pane (RSI 0–100); otherwise it fits the visible values. */
  range?: [number, number];
}

export interface IndicatorDefinition {
  /** Short id used in code and in the `indicators` attribute: "sma", "rsi" ... */
  id: string;
  name: string;
  /** "main": drawn over the price; "pane": its own pane below. */
  placement: "main" | "pane";
  /** Parameter names and defaults, in order (positional in the attribute: "macd:12:26:9"). */
  params: { name: string; default: number; min?: number; max?: number }[];
  compute(candles: readonly Candle[], p: Record<string, number>): IndicatorOutput;
  /** Short label for the legend, e.g. "SMA 20". */
  label(p: Record<string, number>): string;
}

// ------------------------------------------------------------------ math

export function sma(src: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= period) sum -= src[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values (the usual convention). Skips leading NaNs. */
export function ema(src: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(src.length).fill(NaN);
  const k = 2 / (period + 1);
  let start = 0;
  while (start < src.length && !Number.isFinite(src[start])) start++;
  if (src.length - start < period) return out;
  let sum = 0;
  for (let i = start; i < start + period; i++) sum += src[i];
  let prev = sum / period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < src.length; i++) {
    prev = src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Population standard deviation over a sliding window. */
export function stdev(src: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(src.length).fill(NaN);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i]; sumSq += src[i] * src[i];
    if (i >= period) { sum -= src[i - period]; sumSq -= src[i - period] * src[i - period]; }
    if (i >= period - 1) {
      const mean = sum / period;
      out[i] = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
    }
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(src: ArrayLike<number>, period: number): Float64Array {
  const out = new Float64Array(src.length).fill(NaN);
  if (src.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = src[i] - src[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < src.length; i++) {
    const d = src[i] - src[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

const closes = (c: readonly Candle[]) => Float64Array.from(c, (x) => x.close);

// ------------------------------------------------------------------ built-in indicators

const ORANGE = "#f5a524", VIOLET = "#a78bfa", SKY = "#38bdf8";

export const BUILT_IN: IndicatorDefinition[] = [
  {
    id: "sma", name: "Simple moving average", placement: "main",
    params: [{ name: "period", default: 20, min: 1, max: 500 }],
    compute: (c, p) => ({ lines: [{ name: "SMA", values: sma(closes(c), p.period), color: ORANGE }] }),
    label: (p) => `SMA ${p.period}`,
  },
  {
    id: "ema", name: "Exponential moving average", placement: "main",
    params: [{ name: "period", default: 50, min: 1, max: 500 }],
    compute: (c, p) => ({ lines: [{ name: "EMA", values: ema(closes(c), p.period), color: VIOLET }] }),
    label: (p) => `EMA ${p.period}`,
  },
  {
    id: "bb", name: "Bollinger Bands", placement: "main",
    params: [{ name: "period", default: 20, min: 2, max: 500 }, { name: "mult", default: 2, min: 0.1, max: 10 }],
    compute: (c, p) => {
      const cl = closes(c), mid = sma(cl, p.period), sd = stdev(cl, p.period);
      const upper = mid.map((m, i) => m + p.mult * sd[i]);
      const lower = mid.map((m, i) => m - p.mult * sd[i]);
      return {
        lines: [
          { name: "Upper", values: upper, color: SKY },
          { name: "Basis", values: mid, color: ORANGE },
          { name: "Lower", values: lower, color: SKY },
        ],
        band: { upper: 0, lower: 2, color: "rgba(56, 189, 248, 0.07)" },
      };
    },
    label: (p) => `BB ${p.period} ${p.mult}`,
  },
  {
    id: "rsi", name: "Relative strength index", placement: "pane",
    params: [{ name: "period", default: 14, min: 2, max: 200 }],
    compute: (c, p) => ({ lines: [{ name: "RSI", values: rsi(closes(c), p.period), color: VIOLET }], levels: [30, 70], range: [0, 100] }),
    label: (p) => `RSI ${p.period}`,
  },
  {
    id: "macd", name: "MACD", placement: "pane",
    params: [{ name: "fast", default: 12, min: 1, max: 200 }, { name: "slow", default: 26, min: 2, max: 400 }, { name: "signal", default: 9, min: 1, max: 200 }],
    compute: (c, p) => {
      const cl = closes(c), fast = ema(cl, p.fast), slow = ema(cl, p.slow);
      const macd = fast.map((f, i) => f - slow[i]);
      const signal = ema(macd, p.signal);
      const hist = macd.map((m, i) => m - signal[i]);
      const up = new Uint8Array(hist.length);
      for (let i = 0; i < hist.length; i++) up[i] = hist[i] >= 0 ? 1 : 0;
      return {
        lines: [{ name: "MACD", values: macd, color: SKY }, { name: "Signal", values: signal, color: ORANGE }],
        histogram: { values: hist, up, upColor: "rgba(34, 195, 142, 0.55)", downColor: "rgba(240, 80, 110, 0.55)" },
        levels: [0],
      };
    },
    label: (p) => `MACD ${p.fast} ${p.slow} ${p.signal}`,
  },
  {
    id: "volume", name: "Volume", placement: "pane",
    params: [],
    compute: (c) => {
      const v = Float64Array.from(c, (x) => x.volume ?? 0);
      const up = Uint8Array.from(c, (x) => (x.close >= x.open ? 1 : 0));
      return { lines: [], histogram: { values: v, up, upColor: "rgba(34, 195, 142, 0.5)", downColor: "rgba(240, 80, 110, 0.5)" } };
    },
    label: () => "Volume",
  },
];

const REGISTRY = new Map(BUILT_IN.map((d) => [d.id, d]));

/** Adds your own indicator definition (or replaces a built-in one with the same id). */
export function registerIndicator(def: IndicatorDefinition): void { REGISTRY.set(def.id, def); }
export function getIndicator(id: string): IndicatorDefinition | undefined { return REGISTRY.get(id); }
export function listIndicators(): IndicatorDefinition[] { return [...REGISTRY.values()]; }

/** Fills in defaults and clamps to the allowed range. */
export function resolveParams(def: IndicatorDefinition, given: Record<string, number> | number[] = {}): Record<string, number> {
  const out: Record<string, number> = {};
  def.params.forEach((p, i) => {
    const raw = Array.isArray(given) ? given[i] : given[p.name];
    let v = Number.isFinite(raw) ? Number(raw) : p.default;
    if (p.min !== undefined) v = Math.max(p.min, v);
    if (p.max !== undefined) v = Math.min(p.max, v);
    out[p.name] = v;
  });
  return out;
}

/** Parses the `indicators` attribute: "sma:20, ema:50, bb:20:2, rsi, macd:12:26:9, volume". */
export function parseIndicatorList(text: string): { id: string; params: number[] }[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [id, ...rest] = s.split(":").map((x) => x.trim());
    return { id: id.toLowerCase(), params: rest.map(Number) };
  });
}
