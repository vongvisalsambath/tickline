/** One candle. `time` is the start of the candle in milliseconds since 1970 (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** One trade or quote. `time` in milliseconds since 1970 (UTC). */
export interface Tick {
  time: number;
  price: number;
  volume?: number;
}

export type ChartType = "line" | "area" | "candles" | "hollow" | "bars" | "heikin-ashi";

/** A timeframe such as "5s", "1m", "15m", "1h", "4h", "1d", "1w" or "1M" (month). */
export type Timeframe = string;

export interface Theme {
  background: string;
  grid: string;
  text: string;
  textStrong: string;
  axisLine: string;
  up: string;
  down: string;
  line: string;
  areaTop: string;
  areaBottom: string;
  accent: string;
  accentText: string;
  crosshair: string;
  pillBackground: string;
  pillText: string;
  font: string;
  monoFont: string;
}

export type MarkerSide = "buy" | "sell" | "neutral";

/** A labelled point on the chart, e.g. where a position was opened. */
export interface MarkerOptions {
  time: number;
  price: number;
  side?: MarkerSide;
  text?: string;
  color?: string;
}

/** A horizontal line at a price, e.g. an entry price or an alert. */
export interface PriceLineOptions {
  price: number;
  color?: string;
  label?: string;
  style?: "solid" | "dashed" | "dotted";
  width?: number;
  /** Draw only from this time onwards (e.g. from the entry). Default: full width. */
  from?: number;
  /** Draw only up to this time (e.g. to the expiry). Default: full width. */
  to?: number;
}

/** A vertical line at a time, e.g. an expiry. With `countdown`, shows the time left until it. */
export interface TimeLineOptions {
  time: number;
  color?: string;
  label?: string;
  style?: "solid" | "dashed" | "dotted";
  countdown?: boolean;
}

/** A shaded band: above or below a price, or between two prices, optionally limited in time. */
export interface ZoneOptions {
  from: number | "top";
  to: number | "bottom";
  color: string;
  start?: number;
  end?: number;
  label?: string;
}

export interface CrosshairInfo {
  time: number;
  price: number;
  candle: Candle | null;
}

export interface VisibleRange {
  from: number;
  to: number;
}
