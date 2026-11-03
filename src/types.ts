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
  /** Text on coloured tags: markers, price-line labels, drawing tags. */
  overlayText: string;
  /** Dashed reference levels in indicator panes (RSI 30/70, MACD 0). */
  levelLine: string;
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
  /** Show the price in a tag on the price axis (default true). */
  axisLabel?: boolean;
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

/** A price alert: fires the "alert" event when the price crosses it. */
export interface AlertOptions {
  price: number;
  color?: string;
  /** Text by the line (default: the "alert" label). */
  label?: string;
  /** Remove the alert after it fires once (default true). */
  once?: boolean;
}

/** What the "alert" event reports. */
export interface AlertEvent {
  id: string;
  price: number;
  /** "up" when the price rose through the alert, "down" when it fell through it. */
  direction: "up" | "down";
  /** Time of the trade or candle that crossed it (ms). */
  time: number;
  label?: string;
}

/** Options for chart images. */
export interface ImageOptions {
  /** "image/png" (default), "image/jpeg" or "image/webp". */
  type?: "image/png" | "image/jpeg" | "image/webp";
  /** 0–1 for JPEG and WebP. */
  quality?: number;
  /** Pixels per CSS pixel; 2 gives a sharp image for slides and retina screens (default: the screen's). */
  pixelRatio?: number;
  /** Include the crosshair if the pointer is over the chart (default false). */
  crosshair?: boolean;
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
