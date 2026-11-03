// Every setting the chart has, its default, and how partial settings merge.
// One object configures everything: new Chart(el, options), chart.setOptions(patch), or <trade-chart>.setOptions(patch).
import type { ChartType, Theme, Timeframe } from "./types";
import type { DrawingTool } from "./drawings";

export type LineStyle = "solid" | "dashed" | "dotted";

/** A full theme preset, or overrides on top of one: `{ base: "light", up: "#16a34a" }`. */
export type ThemeInput = "dark" | "light" | (Partial<Theme> & { base?: "dark" | "light" });

/** What the time formatter is asked for. */
export type TimeLabelKind = "seconds" | "minutes" | "days" | "day" | "month" | "full" | "crosshair" | "drawing";

export interface LayoutOptions {
  /** Base font size in px for axis labels and tags. Other text scales from it (default 11). */
  fontSize: number;
  /** Height of the time axis in px (default 26). */
  timeAxisHeight: number;
  /** Narrowest the price axis gets in px; it widens for long prices (default 64). */
  priceAxisMinWidth: number;
  /** Space above the highest price for the legend, in px (default 34). */
  paddingTop: number;
  /** Space below the lowest price, in px (default 10). */
  paddingBottom: number;
  /** Most of the height indicator panes can take together, 0–0.9 (default 0.75). */
  paneMaxShare: number;
  /** Smallest height of an indicator pane in px (default 48). */
  paneMinHeight: number;
  /** Starting height of a new indicator pane, as a share of the chart (default 0.22; volume 0.16). */
  paneHeight: number;
}

export interface SeriesOptions {
  /** Candle body width as a share of the candle's slot, 0.1–1 (default 0.72). */
  candleWidth: number;
  /** Draw candle wicks (default true). */
  wicks: boolean;
  /** Line width for line and area charts in px (default 2). */
  lineWidth: number;
  /** Labels at the highest high and lowest low in view (default false). */
  highLowLabels: boolean;
}

export interface GridOptions {
  /** Lines at each price label (default true). */
  horizontal: boolean;
  /** Lines at each time label (default true). */
  vertical: boolean;
}

export interface PriceScaleOptions {
  /** Show the price axis on the right (default true). */
  visible: boolean;
  /** Space kept above and below the visible prices, as a share of the range (default 0.08). */
  margin: number;
  /** Fit the scale to price-pane indicators too, such as Bollinger Bands (default true). */
  includeIndicators: boolean;
  /** Smallest gap between price labels in px (default 64). */
  labelSpacing: number;
}

export interface TimeScaleOptions {
  /** Show the time axis at the bottom (default true). */
  visible: boolean;
  /** Smallest gap between time labels in px (default 110). */
  labelSpacing: number;
  /** Empty space to the right of the live candle, as a share of the width, 0–0.9 (default 0.2). */
  rightPadding: number;
  /** Candles shown when data first loads (default 60). */
  defaultVisibleCandles: number;
  /** Fewest candles you can zoom in to (default 12). */
  minVisibleCandles: number;
  /** Most candles you can zoom out to (default 3000). */
  maxVisibleCandles: number;
}

export interface CrosshairOptions {
  /** "snap" to the candle centre (default), "free" to follow the pointer, or "hidden". */
  mode: "snap" | "free" | "hidden";
  /** Line style (default "dashed"). */
  style: LineStyle;
  /** Price and time tags on the axes (default true). */
  labels: boolean;
}

export interface LegendOptions {
  /** Show the legend at the top left (default true). */
  visible: boolean;
  /** The symbol and timeframe (default true). */
  symbol: boolean;
  /** Open, high, low, close (default true). */
  ohlc: boolean;
  /** The change in % for the candle (default true). */
  change: boolean;
  /** The second row with price-pane indicators and their values (default true). */
  indicators: boolean;
}

export interface LastPriceOptions {
  /** Dotted line at the live price: from the last candle to the axis ("short", default), across the chart ("full"), or "none". */
  line: "short" | "full" | "none";
  /** The live price tag on the axis (default true). */
  tag: boolean;
  /** How many trailing digits of the tag are drawn larger, 0 to turn off (default 3). */
  emphasisDigits: number;
  /** The glowing dot at the live price, pulsing while live (default true). */
  pulse: boolean;
  /** Time left in the current candle next to the live price (default true). */
  countdown: boolean;
  /** Count down to the candle's close ("down", default) or up from its open ("up"). */
  countdownDirection: "down" | "up";
}

/**
 * Where the live price sits on screen while the chart follows it. Each is a share from 0 to 1, or null.
 * `{ x: 0.5, y: 0.5 }` keeps the live price in the centre; `{ x: 0.8 }` keeps it 80% across.
 */
export interface LivePositionOptions {
  /** Across the plot, from the left (0) to the right edge (1). null uses `timeScale.rightPadding` (default null). */
  x: number | null;
  /** Down the price pane, from the top (0) to the bottom (1). null fits the scale to the prices in view (default null). */
  y: number | null;
}

/** Large faint text behind the candles, such as the symbol. */
export interface WatermarkOptions {
  /** The text; "" for none (default ""). "{symbol}" and "{timeframe}" are replaced. */
  text: string;
  /** Colour; "" uses the theme's text colour, faded (default ""). */
  color: string;
  /** Font size in px; 0 sizes it to the chart (default 0). */
  fontSize: number;
}

export interface InteractionOptions {
  /** Drag (or swipe) to scroll through time (default true). */
  pan: boolean;
  /** Mouse wheel and trackpad zoom (default true). */
  wheelZoom: boolean;
  /** Two-finger pinch zoom (default true). */
  pinchZoom: boolean;
  /** Arrow keys, + −, Home, End, Esc, Delete when the chart has focus (default true). */
  keyboard: boolean;
  /** Double-click to go back to the live edge (default true). */
  doubleClickToLive: boolean;
  /** Drag the line between panes to resize them (default true). */
  resizePanes: boolean;
  /** The × that closes an indicator (default true). */
  closeIndicators: boolean;
  /** Select, move and delete drawings (default true). With false, drawings are display-only. */
  editDrawings: boolean;
  /** How much one zoom step (buttons, + −) changes the zoom (default 1.6). */
  zoomStep: number;
}

export interface AnimationOptions {
  /** Smooth live price and price scale (default true; always off when the user prefers reduced motion). */
  enabled: boolean;
  /** How quickly the drawn price catches up with the last trade, in ms (default 110). */
  priceSmoothing: number;
  /** How quickly the price scale adjusts, in ms (default 140). */
  scaleSmoothing: number;
}

export interface HistoryOptions {
  /** Fire "requesthistory" when the user scrolls near the oldest candle (default true). */
  request: boolean;
  /** How close, as a share of the chart width (default 0.25). */
  threshold: number;
}

export interface DrawingOptions {
  /** Colour for new drawings (default the theme accent, #4c9aff). */
  color: string;
  /** Line width for new drawings in px (default 1.5). */
  width: number;
  /** Line style for new drawings (default "solid"). */
  style: LineStyle;
  /** Colours offered when a drawing is selected (<trade-chart> only). */
  colors: string[];
  /** Fibonacci retracement levels (default 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1). */
  fibLevels: number[];
}

export interface FormatOptions {
  /** Prices on the axis, legend, tags and drawings. Gets the value and the decimals in use. */
  price?: (value: number, decimals: number) => string;
  /** Times on the axis, crosshair and drawing tags. `tzOffset` is minutes from UTC for the chart's time zone. */
  time?: (time: number, kind: TimeLabelKind, tzOffset: number) => string;
  /** Countdowns, from milliseconds left. */
  countdown?: (msLeft: number) => string;
  /** Values in indicator panes (volume, RSI, MACD). */
  indicator?: (value: number) => string;
}

/** Every piece of text the chart shows, for translation. `{n}` is replaced with a number. */
export interface Labels {
  chart: string;
  open: string;
  high: string;
  low: string;
  close: string;
  zoomIn: string;
  zoomOut: string;
  backToLive: string;
  live: string;
  zoomLimit: string;
  drawingTools: string;
  selectedDrawing: string;
  deleteDrawing: string;
  delete: string;
  color: string;
  screenshot: string;
  fullscreen: string;
  exitFullscreen: string;
  loading: string;
  lock: string;
  unlock: string;
  duplicate: string;
  hide: string;
  alert: string;
  tools: Record<DrawingTool, string>;
}

/** The HTML controls of <trade-chart> (ignored by the plain Chart class). */
export interface UiOptions {
  /** The − ⌖ + buttons that appear on hover (default true). */
  zoomButtons: boolean;
  /** The "Live ▸" button that appears after scrolling back (default true). */
  liveButton: boolean;
  /** The drawing toolbar (default true). */
  drawingToolbar: boolean;
  /** Which tools it offers, in order (default all five). */
  drawingTools: DrawingTool[];
  /** The toolbar shown for a selected drawing, with colours and Delete (default true). */
  drawingBar: boolean;
  /** The message shown at the closest zoom (default true). */
  zoomLimitMessage: boolean;
  /** A button that downloads the chart as a PNG image (default true). */
  screenshotButton: boolean;
  /** A button that shows the chart full screen (default true). */
  fullscreenButton: boolean;
}

/** All settings, with every value filled in. `chart.options` returns this. */
export interface ResolvedOptions {
  type: ChartType;
  timeframe: Timeframe;
  symbol: string;
  /** Decimals for prices, or "auto" from the data. */
  precision: number | "auto";
  /** "local" or a fixed offset from UTC in minutes, e.g. 420 for UTC+7. */
  timezone: "local" | number;
  /** A BCP 47 locale for numbers and dates, e.g. "de-DE"; "" keeps the built-in English format. */
  locale: string;
  /** Frame-rate cap while animating. */
  fps: number;
  layout: LayoutOptions;
  series: SeriesOptions;
  grid: GridOptions;
  priceScale: PriceScaleOptions;
  timeScale: TimeScaleOptions;
  crosshair: CrosshairOptions;
  legend: LegendOptions;
  lastPrice: LastPriceOptions;
  livePosition: LivePositionOptions;
  watermark: WatermarkOptions;
  interaction: InteractionOptions;
  animation: AnimationOptions;
  history: HistoryOptions;
  drawings: DrawingOptions;
  format: FormatOptions;
  labels: Labels;
  ui: UiOptions;
}

type Groups = Omit<ResolvedOptions, "type" | "timeframe" | "symbol" | "precision" | "timezone" | "locale" | "fps">;

/**
 * Settings for the chart. Everything is optional; groups merge with what's already set,
 * so `{ grid: { vertical: false } }` changes only that one value.
 */
export type ChartOptions = Partial<Pick<ResolvedOptions, "type" | "timeframe" | "symbol" | "precision" | "timezone" | "locale" | "fps">>
  & { [K in keyof Groups]?: K extends "labels" ? Partial<Omit<Labels, "tools">> & { tools?: Partial<Labels["tools"]> } : Partial<Groups[K]> }
  & {
    theme?: ThemeInput;
    /** Shorthand for `animation.enabled`. */
    animate?: boolean;
    /** Shorthand for `lastPrice.countdown`. */
    countdown?: boolean;
    /** Shorthand for `lastPrice.line`. */
    priceLine?: LastPriceOptions["line"];
    /** Shorthand for `timeScale.rightPadding`. */
    rightPadding?: number;
    /** Shorthand for `timeScale.minVisibleCandles`. */
    minVisibleCandles?: number;
    /** Shorthand for `lastPrice.emphasisDigits`. */
    emphasisDigits?: number;
  };

export const DEFAULT_LABELS: Labels = {
  chart: "Price chart",
  open: "O", high: "H", low: "L", close: "C",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  backToLive: "Back to live",
  live: "Live ▸",
  zoomLimit: "You're at the closest zoom ({n} candles). Pick a smaller timeframe to see more detail.",
  drawingTools: "Drawing tools",
  selectedDrawing: "Selected drawing",
  deleteDrawing: "Delete drawing",
  delete: "Delete",
  color: "Colour",
  screenshot: "Download image",
  fullscreen: "Full screen",
  exitFullscreen: "Exit full screen",
  loading: "Loading…",
  lock: "Lock",
  unlock: "Unlock",
  duplicate: "Duplicate",
  hide: "Hide",
  alert: "Alert",
  tools: {
    line: "Line", trend: "Trend line", horizontal: "Horizontal line", vertical: "Vertical line", rect: "Rectangle",
    fib: "Fibonacci retracement", measure: "Measure",
  },
};

export function defaultOptions(): ResolvedOptions {
  return {
    type: "candles",
    timeframe: "1m",
    symbol: "",
    precision: "auto",
    timezone: "local",
    locale: "",
    fps: 60,
    layout: { fontSize: 11, timeAxisHeight: 26, priceAxisMinWidth: 64, paddingTop: 34, paddingBottom: 10, paneMaxShare: 0.75, paneMinHeight: 48, paneHeight: 0.22 },
    series: { candleWidth: 0.72, wicks: true, lineWidth: 2, highLowLabels: false },
    grid: { horizontal: true, vertical: true },
    priceScale: { visible: true, margin: 0.08, includeIndicators: true, labelSpacing: 64 },
    timeScale: { visible: true, labelSpacing: 110, rightPadding: 0.2, defaultVisibleCandles: 60, minVisibleCandles: 12, maxVisibleCandles: 3000 },
    crosshair: { mode: "snap", style: "dashed", labels: true },
    legend: { visible: true, symbol: true, ohlc: true, change: true, indicators: true },
    lastPrice: { line: "short", tag: true, emphasisDigits: 3, pulse: true, countdown: true, countdownDirection: "down" },
    livePosition: { x: null, y: null },
    watermark: { text: "", color: "", fontSize: 0 },
    interaction: { pan: true, wheelZoom: true, pinchZoom: true, keyboard: true, doubleClickToLive: true, resizePanes: true, closeIndicators: true, editDrawings: true, zoomStep: 1.6 },
    animation: { enabled: true, priceSmoothing: 110, scaleSmoothing: 140 },
    history: { request: true, threshold: 0.25 },
    drawings: {
      color: "#4c9aff", width: 1.5, style: "solid",
      colors: ["#4c9aff", "#22c38e", "#f0506e", "#f5a524", "#a78bfa", "#e6e9ef"],
      fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
    },
    format: {},
    labels: { ...DEFAULT_LABELS, tools: { ...DEFAULT_LABELS.tools } },
    ui: {
      zoomButtons: true, liveButton: true, drawingToolbar: true, drawingTools: ["line", "trend", "horizontal", "vertical", "rect", "fib", "measure"],
      drawingBar: true, zoomLimitMessage: true, screenshotButton: true, fullscreenButton: true,
    },
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Deep merge for settings: objects merge, arrays and functions replace, undefined is skipped. */
export function mergeDeep<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeDeep(out[k], v) : Array.isArray(v) ? [...v] : v;
  }
  return out as T;
}

/** Applies `patch` (with shorthands) to resolved settings and keeps values in range. Theme is handled separately. */
export function applyOptions(current: ResolvedOptions, patch: ChartOptions): ResolvedOptions {
  const { theme: _theme, animate, countdown, priceLine, rightPadding, minVisibleCandles, emphasisDigits, ...rest } = patch;
  void _theme;
  const o = mergeDeep(current, rest);
  if (animate !== undefined) o.animation.enabled = animate;
  if (countdown !== undefined) o.lastPrice.countdown = countdown;
  if (priceLine !== undefined) o.lastPrice.line = priceLine;
  if (rightPadding !== undefined) o.timeScale.rightPadding = rightPadding;
  if (minVisibleCandles !== undefined) o.timeScale.minVisibleCandles = minVisibleCandles;
  if (emphasisDigits !== undefined) o.lastPrice.emphasisDigits = emphasisDigits;
  // keep values usable
  const clamp = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  o.fps = clamp(o.fps, 1, 240, 60);
  o.layout.fontSize = clamp(o.layout.fontSize, 6, 32, 11);
  o.layout.paneMaxShare = clamp(o.layout.paneMaxShare, 0, 0.9, 0.75);
  o.series.candleWidth = clamp(o.series.candleWidth, 0.1, 1, 0.72);
  o.timeScale.rightPadding = clamp(o.timeScale.rightPadding, 0, 0.9, 0.2);
  o.timeScale.minVisibleCandles = clamp(o.timeScale.minVisibleCandles, 1, 1e6, 12);
  o.timeScale.maxVisibleCandles = clamp(o.timeScale.maxVisibleCandles, o.timeScale.minVisibleCandles, 1e6, 3000);
  o.timeScale.defaultVisibleCandles = clamp(o.timeScale.defaultVisibleCandles, o.timeScale.minVisibleCandles, o.timeScale.maxVisibleCandles, 60);
  o.interaction.zoomStep = clamp(o.interaction.zoomStep, 1.01, 10, 1.6);
  o.history.threshold = clamp(o.history.threshold, 0, 2, 0.25);
  const share = (v: number | null | undefined, lo: number, hi: number) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.min(hi, Math.max(lo, v)));
  o.livePosition = { x: share(o.livePosition.x, 0.05, 1), y: share(o.livePosition.y, 0.02, 0.98) };
  return o;
}

/** A copy of resolved settings that callers can't use to change the chart behind its back. */
export function cloneOptions(o: ResolvedOptions): ResolvedOptions {
  return mergeDeep(defaultOptions(), o);
}
