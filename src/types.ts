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

/** A point on the chart: a time (ms) and a price. */
export interface ChartPoint { time: number; price: number }

export type ShapeType = "line" | "arrow" | "circle" | "ellipse" | "rect" | "polygon" | "path" | "text" | "image";

/**
 * A shape drawn from code, pinned to time and price so it moves with the chart.
 * - line, arrow: two points (the arrow head is at the second)
 * - circle: the centre, plus `radius` in px or a second point on the edge
 * - ellipse, rect: two opposite corners
 * - polygon, path: any number of points (`closed` joins the ends of a path)
 * - text, image: one anchor point
 */
export interface ShapeOptions {
  type: ShapeType;
  points: ChartPoint[];
  /** Line colour (default: the theme accent). */
  color?: string;
  /** Fill colour for circle, ellipse, rect, polygon and closed paths (default: none). */
  fill?: string;
  /** Line width in px (default 1.5). */
  width?: number;
  style?: "solid" | "dashed" | "dotted";
  /** 0–1 (default 1). */
  opacity?: number;
  /** Circle radius in px (instead of a second point). */
  radius?: number;
  /** Arrow head size in px (default 9). */
  headSize?: number;
  /** Join the last point of a path to the first. */
  closed?: boolean;
  /** Text to show (text shapes; also a label beside lines and boxes). */
  text?: string;
  /** Font size in px (default: the chart font size + 1). */
  fontSize?: number;
  /** Font weight, e.g. 600. */
  fontWeight?: number | string;
  /** Text colour (default: `color`, or white on a background). */
  textColor?: string;
  /** Background behind the text, drawn as a rounded tag. */
  background?: string;
  /** Where the text sits against its point. */
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom";
  /** Image URL (image shapes). */
  src?: string;
  /** Image size in px (default 24 × 24). */
  imageWidth?: number;
  imageHeight?: number;
  /** Draw under the candles ("below") or over them ("above", default). */
  zIndex?: "below" | "above";
}

/** What a custom layer's draw function gets, besides the canvas context. */
export interface LayerContext {
  /** Screen x (CSS px) of a time, and back. */
  timeToX(time: number): number;
  xToTime(x: number): number;
  /** Screen y (CSS px) of a price in the price pane, and back. */
  priceToY(price: number): number;
  yToPrice(y: number): number;
  /** Size of the price pane's plot area (CSS px). */
  width: number;
  height: number;
  /** A clock for animation (ms, from performance.now()). */
  now: number;
  /** The colours and fonts in use. */
  theme: Theme;
  /** The live price and where it's drawn, or null without data. */
  live: { time: number; price: number; x: number; y: number } | null;
  /** The time range in view. */
  range: VisibleRange;
  /** The candles in view (oldest first). */
  candles: readonly Candle[];
}

export interface LayerOptions {
  /** "below" the candles, "above" them (default), or "top" over everything including the axes. */
  zIndex?: "below" | "above" | "top";
  /** Redraw every frame, for animated layers (default false). */
  animate?: boolean;
}

/** Draws the live-price marker yourself: set it as `lastPrice.marker`. */
export type LiveMarkerFn = (ctx: CanvasRenderingContext2D, info: {
  x: number; y: number; color: string; now: number;
  /** True while prices are arriving. */
  live: boolean;
  /** False when animation is off (or the user prefers reduced motion): draw a still marker. */
  animated: boolean;
}) => void;

export interface CrosshairInfo {
  time: number;
  price: number;
  candle: Candle | null;
}

export interface VisibleRange {
  from: number;
  to: number;
}

/** Per-call animation control for view changes (zoomIn, goLive, setVisibleRange, zoomTo …). */
export interface AnimateOptions {
  /** false jumps straight there; leave it out to use the chart's animation settings. */
  animate?: boolean;
  /** Length in ms for this call only (not scaled by animation.speed). */
  duration?: number;
}

/** What the history loader is asked for. */
export interface HistoryRequest {
  /** Return candles older than this time (ms), or the latest candles when null (the first load). */
  before: number | null;
  /** How many candles to return (history.pageSize). Returning fewer is fine; an empty list means there's no older data. */
  count: number;
  timeframe: Timeframe;
  symbol: string;
  /** Aborted when the answer is no longer wanted (the timeframe or symbol changed, or new data was set). */
  signal: AbortSignal | undefined;
}

/** Loads one page of candles. Used for the first load and for each older page. */
export type HistoryLoader = (req: HistoryRequest) => Promise<readonly Candle[]> | readonly Candle[];

/** idle: nothing loading · loading: a page is on its way · error: the last page failed · end: there's no older data. */
export type HistoryState = "idle" | "loading" | "error" | "end";
