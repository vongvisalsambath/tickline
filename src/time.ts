// Timeframes, candle buckets, and time-axis ticks and labels.
import type { Timeframe } from "./types";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export interface ParsedTimeframe {
  /** Approximate length in ms (exact except for months). */
  ms: number;
  unit: "s" | "m" | "h" | "d" | "w" | "M";
  count: number;
}

const UNIT_MS: Record<ParsedTimeframe["unit"], number> = { s: SEC, m: MIN, h: HOUR, d: DAY, w: WEEK, M: 30 * DAY };

/** Parses "5s", "1m", "15m", "1h", "1d", "1w", "1M". Throws on anything else. */
export function parseTimeframe(tf: Timeframe): ParsedTimeframe {
  const m = /^(\d+)\s*(s|m|h|d|w|M)$/.exec(String(tf).trim());
  if (!m) throw new Error(`Unknown timeframe "${tf}". Use forms like 5s, 1m, 15m, 1h, 1d, 1w, 1M.`);
  const count = Number(m[1]);
  const unit = m[2] as ParsedTimeframe["unit"];
  if (count <= 0) throw new Error(`Timeframe "${tf}" must be positive.`);
  return { ms: count * UNIT_MS[unit], unit, count };
}

/** The start of the candle that contains `time` (UTC-aligned; weeks start on Monday; months on the 1st). */
export function bucketStart(time: number, tf: ParsedTimeframe): number {
  if (tf.unit === "M") {
    const d = new Date(time);
    const months = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const start = months - (months % tf.count);
    return Date.UTC(Math.floor(start / 12), start % 12, 1);
  }
  if (tf.unit === "w") {
    // 1970-01-05 was a Monday
    const monday = 4 * DAY;
    return Math.floor((time - monday) / tf.ms) * tf.ms + monday;
  }
  return Math.floor(time / tf.ms) * tf.ms;
}

/** The start of the candle after the one starting at `start`. */
export function nextBucket(start: number, tf: ParsedTimeframe): number {
  if (tf.unit === "M") {
    const d = new Date(start);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + tf.count, 1);
  }
  return start + tf.ms;
}

// ------------------------------------------------------------------ time axis

const STEPS = [
  SEC, 2 * SEC, 5 * SEC, 10 * SEC, 15 * SEC, 30 * SEC,
  MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN,
  HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, WEEK, 14 * DAY,
];

export interface TimeTick {
  time: number;
  label: string;
  /** A bigger boundary (new day, new month): drawn slightly stronger. */
  major: boolean;
  /** Which format the label uses. */
  kind: "seconds" | "minutes" | "days" | "day" | "month";
}

/**
 * Round-boundary ticks between `from` and `to` (ms), at least `minGapMs` apart.
 * Labels: HH:mm:ss under a minute, HH:mm under a day, then "3 Nov", then "Nov 2026".
 */
export function timeTicks(from: number, to: number, minGapMs: number, tzOffsetMin = 0): TimeTick[] {
  if (!(to > from)) return [];
  const step = STEPS.find((s) => s >= minGapMs);
  const ticks: TimeTick[] = [];
  const off = tzOffsetMin * MIN;
  if (step === undefined) {
    // months
    const months = Math.max(1, Math.ceil(minGapMs / (30 * DAY)));
    const d = new Date(from + off);
    let y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (let guard = 0; guard < 2400; guard++) {
      const t = Date.UTC(y, m, 1) - off;
      if (t > to) break;
      if (t >= from && m % months === 0) ticks.push({ time: t, label: formatTime(t, "month", tzOffsetMin), major: m === 0, kind: "month" });
      if (++m > 11) { m = 0; y++; }
    }
    return ticks;
  }
  const kind = step < MIN ? "seconds" : step < DAY ? "minutes" : "days";
  let t = Math.ceil((from + off) / step) * step - off;
  if (step >= DAY) t = Math.ceil((from + off) / DAY) * DAY - off; // align to local midnight, then step in days
  for (let guard = 0; t <= to && guard < 1000; guard++, t += step) {
    const local = t + off;
    const isMidnight = local % DAY === 0;
    const k = kind !== "days" && isMidnight ? "day" : kind;
    ticks.push({ time: t, label: formatTime(t, k, tzOffsetMin), major: isMidnight, kind: k });
  }
  return ticks;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");

export function formatTime(t: number, kind: "seconds" | "minutes" | "days" | "day" | "month" | "full", tzOffsetMin = 0): string {
  const d = new Date(t + tzOffsetMin * MIN);
  const hh = p2(d.getUTCHours()), mm = p2(d.getUTCMinutes()), ss = p2(d.getUTCSeconds());
  switch (kind) {
    case "seconds": return `${hh}:${mm}:${ss}`;
    case "minutes": return `${hh}:${mm}`;
    case "days":
    case "day": return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    case "month": return d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    case "full": return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${hh}:${mm}:${ss}`;
  }
}

/** "04:59", or "1:04:59" over an hour, or "2d 4h" over a day. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${p2(m)}:${p2(r)}` : `${p2(m)}:${p2(r)}`;
}

export const MS = { SEC, MIN, HOUR, DAY, WEEK };

/** A span like "30m", "4h", "1D", "1W", "1M" (month), "1Y" in ms, or null. "m" is minutes and "M" months; other units ignore case. */
export function parseSpan(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([smhdwMyY]|[HDWS])\s*$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2] === "M" ? "M" : m[2].toLowerCase();
  const unit: Record<string, number> = { s: MS.SEC, m: MS.MIN, h: MS.HOUR, d: MS.DAY, w: 7 * MS.DAY, M: 30 * MS.DAY, y: 365 * MS.DAY };
  return n > 0 ? n * unit[u] : null;
}
