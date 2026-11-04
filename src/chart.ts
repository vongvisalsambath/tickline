// The chart engine: one canvas, a view (time per pixel + right edge), a render loop, and pointer/keyboard input.
// Framework-free; <trade-chart> (element.ts) wraps it. Everything is drawn in CSS pixels on a HiDPI canvas.
import type {
  AlertEvent, AlertOptions, AnimateOptions, Candle, HistoryLoader, HistoryRequest, HistoryState, ChartPoint, ChartType, CrosshairInfo, ImageOptions, LayerContext, LayerOptions, LiveMarkerFn, MarkerOptions,
  PriceLineOptions, ShapeOptions, Theme, Tick, TimeLineOptions, Timeframe, VisibleRange, ZoneOptions,
} from "./types";
import { CandleStore } from "./data";
import { autoPrecision, formatPrice, priceTicks, splitEmphasis, stepDecimals, niceStep } from "./price";
import { formatCountdown, formatTime, parseSpan, parseTimeframe, timeTicks, type ParsedTimeframe, MS } from "./time";
import { DARK, LIGHT } from "./theme";
import { applyOptions, cloneOptions, defaultOptions, type AnimationDurations, type ChartOptions, type LineStyle, type ResolvedOptions, type ThemeInput, type TimeLabelKind } from "./options";
import { getIndicator, resolveParams, type IndicatorDefinition, type IndicatorOutput } from "./indicators";
import { MAX_DRAWINGS, POINTS_NEEDED, cleanDrawing, distToDrawing, fibPrice, rayEnd, type Drawing, type DrawingPoint, type DrawingTool } from "./drawings";

export type { ChartOptions } from "./options";

type Overlay =
  | { kind: "marker"; o: MarkerOptions }
  | { kind: "priceLine"; o: PriceLineOptions }
  | { kind: "timeLine"; o: TimeLineOptions }
  | { kind: "zone"; o: ZoneOptions }
  | { kind: "alert"; o: AlertOptions }
  | { kind: "shape"; o: ShapeOptions };

type LayerFn = (ctx: CanvasRenderingContext2D, api: LayerContext) => void;

/** A user's chart, to save and restore: chart type, indicators, drawings, alerts and the view. */
export interface ChartState {
  version: 1;
  type: ChartType;
  /** The timeframe it was saved with. setState doesn't change it: load candles for it first. */
  timeframe: Timeframe;
  indicators: { id: string; params: Record<string, number>; style: IndicatorStyle }[];
  drawings: Drawing[];
  alerts: AlertOptions[];
  /** Following the live price, or a fixed time range. */
  view: { following: boolean; from?: number; to?: number };
}

export interface ChartEvents {
  crosshair: CrosshairInfo | null;
  rangechange: VisibleRange;
  /**
   * Older candles are needed before `before` (ms). Call prependData() with them, or call
   * respondWith(promise) right away and the chart shows the loading state and adds them itself.
   */
  requesthistory: { before: number; count: number; respondWith(candles: Promise<readonly Candle[]> | readonly Candle[]): void };
  /** History loading started, finished, failed, or reached the oldest data. */
  historystate: { state: HistoryState };
  /** The user tried to zoom in past the limit for this timeframe. */
  zoomlimit: { minCandles: number };
  /** Following the live edge turned on or off (e.g. the user panned away). */
  followchange: { following: boolean };
  click: CrosshairInfo;
  /** The list of indicators changed (e.g. the user closed one from its pane). */
  indicatorschange: IndicatorInfo[];
  /** Drawings were added, moved, restyled or deleted. Save `drawings` to restore them later. */
  drawingschange: Drawing[];
  /** The user finished placing a new drawing. */
  drawingcreate: Drawing;
  /** A drawing was selected (or the selection cleared). */
  drawingselect: Drawing | null;
  /** The active drawing tool changed (null when placing finished or was cancelled). */
  toolchange: DrawingTool | null;
  /** The price crossed an alert. */
  alert: AlertEvent;
}

export interface IndicatorInfo {
  key: string;
  id: string;
  label: string;
  params: Record<string, number>;
  style: IndicatorStyle;
  placement: "main" | "pane";
}

/** Per-indicator look: colours of its lines in order, line width, histogram and band colours, pane height. */
export interface IndicatorStyle {
  /** Colours for the indicator's lines, in order (e.g. MACD: [macd, signal]). */
  colors?: string[];
  /** Line width in px. */
  width?: number;
  /** Histogram bar colours (MACD, volume). */
  upColor?: string;
  downColor?: string;
  /** Fill between bands (Bollinger Bands). */
  bandColor?: string;
  /** Reference levels to draw instead of the defaults, e.g. [20, 80] for RSI. */
  levels?: number[];
  /** Starting height of its pane, as a share of the chart (pane indicators only). */
  height?: number;
}

interface ActiveIndicator {
  def: IndicatorDefinition;
  params: Record<string, number>;
  style: IndicatorStyle;
  /** Values for candles off..off+length (the whole history, or a window around the view on long histories). */
  cache: { version: number; from: number; to: number; out: IndicatorOutput; off: number } | null;
  /** Share of the chart height (panes only). */
  frac: number;
  /** Opening (to 1) or closing (to 0). */
  anim: { t0: number; dur: number; to: 0 | 1 } | null;
  /** Closing: drawn until the animation ends, but gone from the API. */
  removing: boolean;
}

/** Indicator output plus the index of its first value. */
interface Win { out: IndicatorOutput; off: number }

type ViewTween = {
  t0: number; dur: number; fromMs: number; toMs: number; fromRight: number;
  /** A time for the right edge, "live" to end at the live edge, or null to leave it (following, or anchored). */
  toRight: number | "live" | null;
  anchor: { x: number; time: number } | null;
};

const EASE: Record<"smooth" | "snappy" | "linear" | "bounce", (t: number) => number> = {
  smooth: (t) => 1 - Math.pow(1 - t, 3),
  snappy: (t) => 1 - Math.pow(1 - t, 5),
  linear: (t) => t,
  bounce: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const clamp01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);

interface PaneBox { key: string | null; top: number; h: number; min?: number; max?: number }
interface Hit { x: number; y: number; w: number; h: number; run: () => void }

type Handler<T> = (e: T) => void;


export class Chart {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private store: CandleStore;
  private tf: ParsedTimeframe;
  private opts: ResolvedOptions;
  private theme: Theme = DARK;
  private overlays = new Map<string, Overlay>();
  private nextId = 1;
  private handlers: { [K in keyof ChartEvents]?: Set<Handler<ChartEvents[K]>> } = {};

  // view
  private w = 0; private h = 0; private dpr = 1;
  private msPerPx = 0;
  private rightTime = 0;
  private following = true;
  private priceMin = 0; private priceMax = 1;
  private scaleReady = false;
  private axisW = 64;

  // live animation
  private displayPrice = NaN;
  private lastFrame = 0;
  private raf = 0;
  private dirty = true;
  private visible = true;
  private reducedMotion = false;
  private haCache: { version: number; data: Candle[] } | null = null;
  // animations
  private animUntil = 0;
  private viewAnim: ViewTween | null = null;
  private intro: { t0: number; dur: number } | null = null;
  private newCandle: { time: number; t0: number; dur: number } | null = null;
  private typeAnim: { from: ChartType; t0: number; dur: number } | null = null;
  private histFade: { before: number; t0: number; dur: number } | null = null;
  private overlayBorn = new Map<string, { t0: number; dur: number }>();
  private fading = new Map<string, { ov: Overlay; t0: number; dur: number }>();
  // price scale set by hand (axis drag or setPriceRange)
  private manualScale = false;
  private axisDrag: { kind: "price"; y: number; min: number; max: number } | { kind: "time"; x: number; ms: number } | null = null;
  // history pages
  private loader: HistoryLoader | null = null;
  private hist: { state: HistoryState; gen: number; abort: AbortController | null } = { state: "idle", gen: 0, abort: null };
  private dataVersion = 0;
  private historyRequestedFor = NaN;
  private lastRange: VisibleRange = { from: 0, to: 0 };
  private indicators = new Map<string, ActiveIndicator>();
  private layoutBoxes: PaneBox[] = [];
  private hits: Hit[] = [];
  private paneDrag: { index: number; y: number; above: number; below: number } | null = null;
  private drawingList: Drawing[] = [];
  private tool: DrawingTool | null = null;
  private placing: { tool: DrawingTool; points: DrawingPoint[]; hover: DrawingPoint | null } | null = null;
  private selectedId: string | null = null;
  private drawDrag: { id: string; handle: number; start: { x: number; y: number }; orig: DrawingPoint[]; moved: boolean } | null = null;
  /** Colour for new drawings (same as `options.drawings.color`). */
  get drawingColor(): string { return this.opts.drawings.color; }
  set drawingColor(c: string) { this.opts.drawings.color = c; }
  private numberFormats = new Map<string, Intl.NumberFormat>();
  private loadingOn = false;
  private layers: { draw: LayerFn; z: "below" | "above" | "top"; animate: boolean }[] = [];
  private images = new Map<string, HTMLImageElement | null>();
  /** Screen boxes of text drawings, for hit testing (filled while drawing). */
  private textBoxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  /** Crosshair time shown because another chart is synced to this one. */
  private syncTime: number | null = null;
  private dateFormats = new Map<string, Intl.DateTimeFormat>();

  // input
  private pointer: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; rightTime: number; min: number; max: number; moved: boolean; id: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; msPerPx: number; anchorTime: number; anchorX: number } | null = null;
  private resizeObs: ResizeObserver | null = null;
  private interObs: IntersectionObserver | null = null;
  private cleanups: (() => void)[] = [];

  constructor(private container: HTMLElement, options: ChartOptions = {}) {
    this.opts = applyOptions(defaultOptions(), options);
    this.tf = parseTimeframe(this.opts.timeframe);
    this.store = new CandleStore(this.tf);
    this.setTheme(options.theme ?? "dark");

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:crosshair";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", this.opts.labels.chart);
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;

    this.reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.bindInput();
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(container);
    } else if (typeof window !== "undefined") {
      // older browsers: follow the window size instead
      const onResize = () => this.resize();
      window.addEventListener("resize", onResize);
      this.cleanups.push(() => window.removeEventListener("resize", onResize));
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.interObs = new IntersectionObserver((es) => { this.visible = es.some((e) => e.isIntersecting); this.kick(); });
      this.interObs.observe(this.canvas);
    }
    const onVis = () => this.kick();
    document.addEventListener("visibilitychange", onVis);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
    this.kick();
  }

  // ================================================================ public API: data

  /** Replaces the history. Candles may be in any order; they're grouped into the current timeframe. */
  setData(candles: readonly Candle[]): void {
    this.cancelHistory();
    this.setHist("idle");
    this.replaceData(candles);
  }

  /** Adds older candles (e.g. in answer to "requesthistory") without moving the view. Returns how many were added. */
  prependData(candles: readonly Candle[]): number {
    const before = this.store.first?.time;
    const added = this.store.prepend(candles);
    if (added > 0) {
      this.historyRequestedFor = NaN;
      this.haCache = null;
      const dur = this.dur("history");
      if (before !== undefined && dur > 0) { this.histFade = { before, t0: performance.now(), dur }; this.animate(dur); }
    }
    this.onDataChanged(false);
    return added;
  }

  /**
   * Loads candles page by page: the latest page when the chart is empty, then older pages as the user
   * scrolls back, with the loading shown inside the chart. Changing the timeframe or symbol reloads.
   * Pass null to stop.
   * @example chart.setHistoryLoader(async ({ before, count, signal }) => (await fetch(`/candles?before=${before ?? ""}&limit=${count}`, { signal })).json());
   */
  setHistoryLoader(loader: HistoryLoader | null): void {
    this.cancelHistory();
    this.loader = loader;
    this.setHist("idle");
    this.historyRequestedFor = NaN;
    if (loader && !this.store.length) this.reloadHistory();
  }

  /** Clears the candles and loads the latest page again with the history loader. */
  reloadHistory(): void {
    if (!this.loader) return;
    this.cancelHistory();
    this.store.set([]);
    this.haCache = null;
    this.onDataChanged(true);
    this.loadHistory(this.loader, null);
  }

  /** Tries the last failed history page again. */
  retryHistory(): void {
    if (this.hist.state !== "error") return;
    this.setHist("idle");
    this.historyRequestedFor = NaN;
    if (!this.store.length && this.loader) this.loadHistory(this.loader, null);
    this.markDirty();
  }

  /** Whether history is idle, loading, failed ("error"), or at the oldest data ("end"). */
  get historyState(): HistoryState { return this.hist.state; }

  /** Plays the intro animation (candles rising in from left to right) again. */
  playIntro(): void {
    const dur = this.dur("intro");
    this.intro = dur > 0 ? { t0: performance.now(), dur } : null;
    this.animate(dur);
    this.markDirty();
  }

  /** A live trade or quote: grows the current candle or starts the next one. */
  tick(t: Tick): void {
    const prev = this.store.last?.close ?? NaN;
    const r = this.store.tick(t);
    if (r === "ignored") return;
    if (r === "added") this.candleAdded();
    if (!Number.isFinite(this.displayPrice) || !this.animated) this.displayPrice = t.price;
    this.onDataChanged(false);
    this.checkAlerts(prev, t.price, t.time);
  }

  /** A whole candle (e.g. from a kline stream): replaces the current one or appends a new one. */
  update(c: Candle): void {
    const prev = this.store.last?.close ?? NaN;
    const r = this.store.upsert(c);
    if (r === "ignored") return;
    if (r === "added") this.candleAdded();
    if (!Number.isFinite(this.displayPrice) || !this.animated) this.displayPrice = c.close;
    this.onDataChanged(false);
    this.checkAlerts(prev, c.close, c.time);
  }

  /** Shows the loading state inside the chart (placeholder candles when it's empty), or hides it. */
  setLoading(on: boolean): void { this.loadingOn = on; this.markDirty(); }
  get loading(): boolean { return this.loadingOn; }

  /** All candles currently held (oldest first). */
  get data(): readonly Candle[] { return this.store.all; }

  // ================================================================ public API: settings

  setType(type: ChartType): void {
    const from = this.opts.type, dur = this.dur("typeChange");
    if (type === from || !["line", "area", "candles", "hollow", "bars", "heikin-ashi"].includes(type)) return;
    this.opts.type = type;
    this.typeAnim = dur > 0 && this.store.length ? { from, t0: performance.now(), dur } : null;
    this.animate(dur);
    this.markDirty();
  }
  get type(): ChartType { return this.opts.type; }

  /** Changes the timeframe. Existing candles are regrouped (only to a coarser timeframe makes sense); load fresh history for best results. */
  setTimeframe(tf: Timeframe): void {
    const parsed = parseTimeframe(tf);
    const old = this.store.all, oldMs = this.tf.ms;
    this.opts.timeframe = tf;
    this.tf = parsed;
    this.store = new CandleStore(parsed);
    this.haCache = null;
    this.viewAnim = null;
    this.cancelHistory();
    this.setHist("idle");
    // candles can be merged into a coarser timeframe, but not split into a finer one; with a loader, load afresh
    this.store.set(parsed.ms >= oldMs && !this.loader ? old : []);
    this.msPerPx = 0; // recompute a default zoom for this timeframe
    this.following = true;
    this.onDataChanged(true);
    if (this.loader) this.loadHistory(this.loader, null);
  }
  get timeframe(): Timeframe { return this.opts.timeframe; }

  /** "dark", "light", a full theme, or overrides on a preset: `{ base: "light", up: "#16a34a" }`. */
  setTheme(theme: ThemeInput | Theme): void {
    if (theme === "light" || theme === "dark") this.theme = theme === "light" ? LIGHT : DARK;
    else {
      const { base, ...rest } = theme as Partial<Theme> & { base?: "dark" | "light" };
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== ""));
      this.theme = { ...(base === "light" ? LIGHT : DARK), ...clean };
    }
    this.markDirty();
  }
  /** The colours and fonts in use. */
  get currentTheme(): Theme { return { ...this.theme }; }

  /**
   * Changes any settings. Groups merge with what's set, so `{ grid: { vertical: false } }` changes only that.
   * See ChartOptions for every setting and its default.
   */
  setOptions(o: ChartOptions): void {
    const prevTf = this.opts.timeframe, prevSymbol = this.opts.symbol;
    this.opts = applyOptions(this.opts, o);
    if (this.loader && this.opts.symbol !== prevSymbol && this.opts.timeframe === prevTf) this.reloadHistory();
    if (this.opts.timeframe !== prevTf) {
      const next = this.opts.timeframe;
      this.opts.timeframe = prevTf;
      this.setTimeframe(next);
    }
    if (o.theme) this.setTheme(o.theme);
    if (o.labels?.chart) this.canvas.setAttribute("aria-label", this.opts.labels.chart);
    if (o.locale !== undefined) { this.numberFormats.clear(); this.dateFormats.clear(); }
    this.msPerPx = this.msPerPx && Math.min(this.maxMsPerPx(), Math.max(this.minMsPerPx(), this.msPerPx));
    this.markDirty();
  }
  /** A copy of every setting, with defaults filled in. */
  get options(): ResolvedOptions { return cloneOptions(this.opts); }

  // ================================================================ public API: overlays

  addMarker(o: MarkerOptions): string { return this.addOverlay({ kind: "marker", o }); }
  addPriceLine(o: PriceLineOptions): string { return this.addOverlay({ kind: "priceLine", o }); }
  addTimeLine(o: TimeLineOptions): string { return this.addOverlay({ kind: "timeLine", o }); }
  addZone(o: ZoneOptions): string { return this.addOverlay({ kind: "zone", o }); }
  /**
   * A shape drawn from code: line, arrow, circle, ellipse, rect, polygon, path, text or image.
   * It's pinned to time and price, so it moves with the chart. Returns its id (change it with
   * updateOverlay, remove it with removeOverlay).
   */
  addShape(o: ShapeOptions): string { return this.addOverlay({ kind: "shape", o: { ...o, points: o.points.map((q) => ({ ...q })) } }); }

  /** All shapes added with addShape, with their ids. */
  get shapes(): (ShapeOptions & { id: string })[] {
    return [...this.overlays].filter(([, ov]) => ov.kind === "shape").map(([id, ov]) => ({ ...(ov.o as ShapeOptions), id }));
  }

  /**
   * Draws anything on the chart, every frame, with the canvas context and helpers that turn
   * times and prices into screen positions. Returns a function that removes the layer.
   * @example chart.addLayer((ctx, { timeToX, priceToY }) => { ctx.fillRect(timeToX(t) - 2, priceToY(p) - 2, 4, 4); });
   */
  addLayer(draw: LayerFn, o: LayerOptions = {}): () => void {
    const layer = { draw, z: o.zIndex ?? "above", animate: !!o.animate };
    this.layers.push(layer);
    this.markDirty();
    return () => { this.layers = this.layers.filter((l) => l !== layer); this.markDirty(); };
  }

  private rotation: 0 | 90 = 0;
  /**
   * Tells the chart it's shown turned a quarter clockwise (90) or upright (0), so touches and clicks
   * land in the right place. <trade-chart> does this itself for landscape full screen on phones.
   */
  setRotation(deg: 0 | 90): void {
    if (deg === this.rotation) return;
    this.rotation = deg;
    this.w = 0; // force a resize
    this.resize();
  }
  get screenRotation(): 0 | 90 { return this.rotation; }

  /** Where a time and price are on screen (CSS px from the top-left of the chart). */
  toScreen(p: ChartPoint): { x: number; y: number } { return { x: this.timeToX(p.time), y: this.priceToY(p.price) }; }
  /** The time and price at a screen position in the price pane. */
  fromScreen(p: { x: number; y: number }): ChartPoint { return { time: this.xToTime(p.x), price: this.yToPrice(p.y) }; }

  /** A price alert: a line that fires the "alert" event when the price crosses it. Returns its id. */
  addAlert(o: AlertOptions): string { return this.addOverlay({ kind: "alert", o }); }
  /** All alerts still waiting, with their ids. */
  get alerts(): (AlertOptions & { id: string })[] {
    return [...this.overlays].filter(([, ov]) => ov.kind === "alert").map(([id, ov]) => ({ ...(ov.o as AlertOptions), id }));
  }

  /** Changes an overlay's options (merged). */
  updateOverlay(id: string, patch: Partial<MarkerOptions & PriceLineOptions & TimeLineOptions & ZoneOptions & AlertOptions> | Partial<ShapeOptions>): void {
    const ov = this.overlays.get(id);
    if (!ov) return;
    ov.o = { ...ov.o, ...patch } as never;
    this.markDirty();
  }
  removeOverlay(id: string): void { this.dropOverlay(id); }
  clearOverlays(): void { for (const id of [...this.overlays.keys()]) this.dropOverlay(id); }

  // ================================================================ public API: indicators

  /**
   * Adds a built-in or registered indicator: "sma", "ema", "bb", "rsi", "macd", "volume".
   * Params by name ({ period: 14 }) or in order ([12, 26, 9]). Returns a key for update/remove.
   */
  addIndicator(id: string, params?: Record<string, number> | number[], style: IndicatorStyle = {}): string {
    const def = getIndicator(id.toLowerCase());
    if (!def) throw new Error(`Unknown indicator "${id}".`);
    const key = "ind" + this.nextId++;
    const frac = style.height ?? (def.id === "volume" ? Math.min(0.16, this.opts.layout.paneHeight) : this.opts.layout.paneHeight);
    const dur = this.dur("panes");
    this.indicators.set(key, { def, params: resolveParams(def, params), style: { ...style }, cache: null, frac, anim: dur > 0 ? { t0: performance.now(), dur, to: 1 } : null, removing: false });
    this.animate(dur);
    this.markDirty();
    return key;
  }
  /** Changes an indicator's parameters and, optionally, its style (merged). */
  updateIndicator(key: string, params?: Record<string, number> | number[], style?: IndicatorStyle): void {
    const ind = this.indicators.get(key);
    if (!ind || ind.removing) return;
    if (params) ind.params = resolveParams(ind.def, Array.isArray(params) ? params : { ...ind.params, ...params });
    if (style) { ind.style = { ...ind.style, ...style }; if (style.height !== undefined) ind.frac = style.height; }
    ind.cache = null;
    this.markDirty();
  }
  removeIndicator(key: string): void {
    const ind = this.indicators.get(key);
    if (!ind || ind.removing) return;
    const dur = this.dur("panes");
    if (dur > 0) { ind.removing = true; ind.anim = { t0: performance.now(), dur, to: 0 }; this.animate(dur); }
    else this.indicators.delete(key);
    this.markDirty();
  }
  clearIndicators(): void { for (const key of [...this.indicators.keys()]) this.removeIndicator(key); }
  get indicatorList(): IndicatorInfo[] {
    return this.activeIndicators().map(([key, i]) => ({ key, id: i.def.id, label: i.def.label(i.params), params: { ...i.params }, style: { ...i.style }, placement: i.def.placement }));
  }

  // ================================================================ public API: drawings

  /** Starts placing a drawing with this tool (click once or twice on the chart), or stops with null. */
  setDrawingTool(tool: DrawingTool | null): void {
    this.tool = tool;
    this.placing = tool ? { tool, points: [], hover: null } : null;
    this.select(null);
    this.emit("toolchange", tool);
    this.markDirty();
  }
  get drawingTool(): DrawingTool | null { return this.tool; }

  /** Copies of all drawings, safe to store as JSON. */
  get drawings(): Drawing[] { return this.drawingList.map((d) => ({ ...d, points: d.points.map((q) => ({ ...q })) })); }

  /** Replaces all drawings (e.g. restoring saved ones). */
  setDrawings(list: readonly Drawing[]): void {
    // saved drawings may come from anywhere: keep only ones that can be drawn, checked field by field
    const ids = new Set<string>();
    this.drawingList = [];
    for (const d of Array.isArray(list) ? list : []) {
      if (this.drawingList.length >= MAX_DRAWINGS) break;
      const clean = cleanDrawing(d, { id: "dr" + this.nextId++, color: this.drawingColor });
      if (!clean) continue;
      if (ids.has(clean.id)) clean.id = "dr" + this.nextId++;
      ids.add(clean.id);
      this.drawingList.push(clean);
    }
    this.select(null);
    this.markDirty();
  }

  /** Adds a drawing in code. Returns its id. */
  addDrawing(d: Omit<Drawing, "id" | "color"> & { color?: string }): string {
    const id = "dr" + this.nextId++;
    const clean = cleanDrawing({ width: this.opts.drawings.width, style: this.opts.drawings.style, ...d, id }, { id, color: this.drawingColor });
    if (!clean) throw new Error(`A ${String(d?.tool)} drawing needs a known tool and ${POINTS_NEEDED[d?.tool] ?? "enough"} points with finite time and price.`);
    if (this.drawingList.length >= MAX_DRAWINGS) throw new Error(`A chart keeps at most ${MAX_DRAWINGS} drawings.`);
    this.drawingList.push(clean);
    this.drawingsChanged();
    return id;
  }

  /** Copies a drawing, a little to the right and below, and selects the copy. Returns its id. */
  duplicateDrawing(id: string): string | null {
    const d = this.drawingList.find((x) => x.id === id);
    if (!d) return null;
    const dt = 24 * (this.msPerPx || this.tf.ms / 10);
    const dp = this.msPerPx ? this.yToPrice(0) - this.yToPrice(24) : 0;
    const copy: Drawing = { ...d, id: "dr" + this.nextId++, locked: false, points: d.points.map((q) => ({ time: q.time + dt, price: q.price - dp })) };
    this.drawingList.push(copy);
    this.drawingsChanged();
    this.select(copy.id);
    return copy.id;
  }

  /** Changes a drawing's colour, width, style, lock or visibility. */
  updateDrawing(id: string, patch: Partial<Pick<Drawing, "color" | "width" | "style" | "locked" | "hidden" | "text" | "fontSize">>): void {
    const i = this.drawingList.findIndex((x) => x.id === id);
    if (i < 0 || !patch || typeof patch !== "object") return;
    const d = this.drawingList[i];
    const { color, width, style, locked, hidden, text, fontSize } = patch;
    const clean = cleanDrawing({ ...d, ...{ color, width, style, locked, hidden, text, fontSize } }, { id: d.id, color: d.color });
    if (!clean) return;
    // only the fields this method changes, and only to values that can be drawn
    for (const k of Object.keys(clean) as (keyof Drawing)[]) if (k !== "id" && k !== "tool" && k !== "points") (d as unknown as Record<string, unknown>)[k] = clean[k];
    this.drawingsChanged();
  }
  removeDrawing(id: string): void {
    const n = this.drawingList.length;
    this.drawingList = this.drawingList.filter((d) => d.id !== id);
    if (this.selectedId === id) this.select(null);
    if (this.drawingList.length !== n) this.drawingsChanged();
  }
  clearDrawings(): void { this.drawingList = []; this.select(null); this.drawingsChanged(); }
  get selectedDrawing(): Drawing | null { return this.drawingList.find((d) => d.id === this.selectedId) ?? null; }

  private select(id: string | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.emit("drawingselect", this.selectedDrawing);
    this.markDirty();
  }
  private drawingsChanged(): void { this.emit("drawingschange", this.drawings); this.markDirty(); }

  // ================================================================ public API: view

  zoomIn(o: AnimateOptions = {}): void { this.zoomAt(this.zoomAnchorX(), 1 / this.opts.interaction.zoomStep, o); }
  zoomOut(o: AnimateOptions = {}): void { this.zoomAt(this.zoomAnchorX(), this.opts.interaction.zoomStep, o); }
  /** Zooms by a factor around the centre (or the live edge when following): 2 shows twice as much time, 0.5 half. */
  zoomBy(factor: number, o: AnimateOptions = {}): void { if (factor > 0) this.zoomAt(this.zoomAnchorX(), factor, o); }

  /**
   * Shows a span of time up to the live edge, e.g. "30m", "4h", "1D", "1W", "1M" (a month), "1Y", or "All"
   * for all loaded candles. Limited by timeScale.minVisibleCandles and maxVisibleCandles.
   */
  zoomTo(range: string, o: AnimateOptions = {}): void {
    if (/^\s*all\s*$/i.test(range)) { this.fitContent(o); return; }
    const span = parseSpan(range);
    if (span === null) throw new Error(`Unknown range "${range}". Use a span like "4h", "1D", "1W", "1M", "1Y", or "All".`);
    this.setFollowing(true);
    this.tweenView(this.clampMs(span / (this.plotW() * (1 - this.rightPad()))), { right: "live" }, this.viewDur("scroll", o));
  }

  /** Back to the default zoom (timeScale.defaultVisibleCandles) and an automatic price scale. */
  resetZoom(o: AnimateOptions = {}): void {
    this.manualScale = false;
    const ms = this.clampMs(this.defaultMsPerPx());
    if (this.following) this.tweenView(ms, { right: "live" }, this.viewDur("zoom", o));
    else { const x = this.plotW() / 2; this.tweenView(ms, { anchor: { x, time: this.xToTime(x) } }, this.viewDur("zoom", o)); }
  }

  /**
   * Shows this time range (ms). With `follow`, keeps following the live price at this zoom
   * instead of staying on the range.
   */
  setVisibleRange(range: VisibleRange, opts: { follow?: boolean } & AnimateOptions = {}): void {
    if (!Number.isFinite(range?.from) || !Number.isFinite(range?.to) || !(range.to > range.from)) return;
    const ms = this.clampMs((range.to - range.from) / this.plotW());
    if (opts.follow) { this.setFollowing(true); this.tweenView(ms, { right: "live" }, this.viewDur("scroll", opts)); }
    else { this.setFollowing(false); this.tweenView(ms, { right: range.to }, this.viewDur("scroll", opts)); }
  }

  /** Scrolls so `time` is at `position` across the chart (0 left, 0.5 middle, 1 right). Stops following. */
  scrollToTime(time: number, position = 0.5, o: AnimateOptions = {}): void {
    if (!this.msPerPx) this.msPerPx = this.clampMs(this.defaultMsPerPx());
    const ms = this.viewAnim?.toMs ?? this.msPerPx;
    this.setFollowing(false);
    this.tweenView(ms, { right: time + (1 - Math.min(1, Math.max(0, position))) * this.plotW() * ms }, this.viewDur("scroll", o));
  }

  /** Fixes the price scale to this range (as dragging the price axis does), or goes back to fitting the prices in view with null. */
  setPriceRange(range: { min: number; max: number } | null): void {
    if (range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min) {
      this.manualScale = true; this.priceMin = range.min; this.priceMax = range.max; this.scaleReady = true;
    } else this.manualScale = false;
    this.markDirty();
  }
  /** The price range on the scale now. */
  get priceRange(): { min: number; max: number } { return { min: this.priceMin, max: this.priceMax }; }
  /** True while the price scale fits the prices in view (false after the price axis was dragged or setPriceRange). */
  get autoScale(): boolean { return !this.manualScale; }

  /** Shows a vertical crosshair at `time` without a pointer (used to sync charts), or hides it with null. */
  setCrosshair(time: number | null): void { this.syncTime = time; this.markDirty(); }
  /** Back to the live edge, following new prices. */
  goLive(o: AnimateOptions = {}): void {
    if (this.following && !this.viewAnim) { this.markDirty(); return; }
    this.setFollowing(true);
    this.tweenView(this.viewAnim?.toMs ?? this.msPerPx, { right: "live" }, this.viewDur("scroll", o));
  }
  get isFollowing(): boolean { return this.following; }
  /** Shows the whole history. */
  fitContent(o: AnimateOptions = {}): void {
    const first = this.store.first, last = this.store.last;
    if (!first || !last) return;
    const span = this.store.endOf(last) - first.time;
    this.setFollowing(true);
    this.tweenView(this.clampMs(span / (this.plotW() * (1 - this.rightPad()))), { right: "live" }, this.viewDur("scroll", o));
  }
  get visibleRange(): VisibleRange { return { ...this.lastRange }; }

  // ================================================================ public API: images and state

  /** The chart as an image Blob (PNG by default), without the crosshair. */
  toBlob(o: ImageOptions = {}): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.renderForImage(o, (c) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser couldn't create the image."))), o.type ?? "image/png", o.quality));
    });
  }

  /** The chart as a data: URL (PNG by default). */
  toDataURL(o: ImageOptions = {}): string {
    let url = "";
    this.renderForImage(o, (c) => { url = c.toDataURL(o.type ?? "image/png", o.quality); });
    return url;
  }

  /** Downloads the chart as an image, named after the symbol and timeframe unless you give a name. */
  async downloadImage(filename?: string, o: ImageOptions = {}): Promise<void> {
    const blob = await this.toBlob(o);
    const ext = (o.type ?? "image/png").split("/")[1].replace("jpeg", "jpg");
    const base = (this.opts.symbol || "chart").replace(/[^\w.-]+/g, "-") + "-" + this.opts.timeframe;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename ?? `${base}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /** The user's chart as plain data (JSON-safe): type, indicators, drawings, alerts and view. */
  getState(): ChartState {
    return {
      version: 1,
      type: this.opts.type,
      timeframe: this.opts.timeframe,
      indicators: this.indicatorList.map((i) => ({ id: i.id, params: i.params, style: i.style })),
      drawings: this.drawings,
      alerts: this.alerts.map(({ id: _id, ...a }) => a),
      view: this.following ? { following: true } : { following: false, from: this.lastRange.from, to: this.lastRange.to },
    };
  }

  /** Restores what getState() returned. Parts you leave out are kept as they are. */
  setState(st: Partial<ChartState>): void {
    if (st.type) this.setType(st.type);
    if (Array.isArray(st.indicators)) {
      this.clearIndicators();
      for (const i of st.indicators.slice(0, 50)) { try { this.addIndicator(i.id, i.params, i.style); } catch (e) { console.warn(`Tickline: ${(e as Error).message}`); } }
      this.emit("indicatorschange", this.indicatorList);
    }
    if (st.drawings) this.setDrawings(st.drawings);
    if (Array.isArray(st.alerts)) {
      for (const [id, ov] of [...this.overlays]) if (ov.kind === "alert") this.dropOverlay(id);
      // a saved state may come from anywhere: only alerts at a finite price, with short text
      for (const a of st.alerts.slice(0, 500)) {
        if (!a || typeof a !== "object" || typeof a.price !== "number" || !Number.isFinite(a.price)) continue;
        this.addAlert({
          price: a.price,
          ...(typeof a.color === "string" && a.color.length <= 64 ? { color: a.color } : {}),
          ...(typeof a.label === "string" ? { label: a.label.slice(0, 100) } : {}),
          ...(typeof a.once === "boolean" ? { once: a.once } : {}),
        });
      }
    }
    if (st.view && typeof st.view === "object") {
      if (st.view.following || !Number.isFinite(st.view.from) || !Number.isFinite(st.view.to)) this.goLive();
      else this.setVisibleRange({ from: st.view.from as number, to: st.view.to as number });
    }
    this.markDirty();
  }

  // ================================================================ events

  on<K extends keyof ChartEvents>(type: K, fn: Handler<ChartEvents[K]>): () => void {
    const map = this.handlers as Record<string, Set<Handler<never>> | undefined>;
    (map[type] ??= new Set()).add(fn as Handler<never>);
    return () => this.off(type, fn);
  }
  off<K extends keyof ChartEvents>(type: K, fn: Handler<ChartEvents[K]>): void {
    (this.handlers[type] as Set<Handler<ChartEvents[K]>> | undefined)?.delete(fn);
  }
  private emit<K extends keyof ChartEvents>(type: K, e: ChartEvents[K]): void {
    (this.handlers[type] as Set<Handler<ChartEvents[K]>> | undefined)?.forEach((fn) => { try { fn(e); } catch (err) { console.error(err); } });
  }

  /** Stops rendering and removes listeners and the canvas. */
  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.interObs?.disconnect();
    this.cleanups.forEach((f) => f());
    this.canvas.remove();
    this.handlers = {};
  }

  // ================================================================ internals: data and view

  private get animated(): boolean {
    const a = this.opts.animation;
    return a.enabled && !(this.reducedMotion && a.respectReducedMotion);
  }

  /** How long an animation of this kind lasts now, in ms (0 when animation is off). */
  private dur(kind: keyof AnimationDurations): number {
    return this.animated ? this.opts.animation.durations[kind] / this.opts.animation.speed : 0;
  }
  private viewDur(kind: "zoom" | "scroll", o: AnimateOptions): number {
    if (o.animate === false || !this.animated) return 0;
    return o.duration !== undefined ? Math.max(0, o.duration) : this.dur(kind);
  }
  private ease(t: number): number {
    const e = this.opts.animation.easing, x = clamp01(t);
    if (typeof e === "function") { const v = e(x); return Number.isFinite(v) ? v : x; }
    return (EASE[e] ?? EASE.smooth)(x);
  }
  /** Progress 0–1 of an animation that started at t0. */
  private prog(t0: number, dur: number, now = performance.now()): number { return dur > 0 ? clamp01((now - t0) / dur) : 1; }
  /** Keeps frames coming for `dur` ms. */
  private animate(dur: number): void {
    if (dur <= 0) return;
    this.animUntil = Math.max(this.animUntil, performance.now() + dur + 20);
    this.kick();
  }

  private clampMs(ms: number): number { return Math.min(this.maxMsPerPx(), Math.max(this.minMsPerPx(), ms)); }
  private zoomAnchorX(): number { return this.plotW() * (this.following ? 1 - this.rightPad() : 0.5); }
  /** Right edge time that keeps the live candle at its place. */
  private liveRight(): number { return this.liveTime() + this.plotW() * this.rightPad() * this.msPerPx; }

  /** Moves the view to a zoom (ms per px) and a right edge or anchor, animated over `dur` ms. */
  private tweenView(toMs: number, to: { right?: number | "live"; anchor?: { x: number; time: number } }, dur: number): void {
    if (!this.msPerPx || dur <= 0) {
      this.viewAnim = null;
      this.msPerPx = toMs;
      if (to.anchor) this.rightTime = to.anchor.time + (this.plotW() - to.anchor.x) * toMs;
      else if (typeof to.right === "number") this.rightTime = to.right;
      this.markDirty();
      return;
    }
    this.viewAnim = { t0: performance.now(), dur, fromMs: this.msPerPx, toMs, fromRight: this.rightTime, toRight: to.right ?? null, anchor: to.anchor ?? null };
    this.animate(dur);
    this.markDirty();
  }

  private candleAdded(): void {
    const last = this.store.last, dur = this.dur("newCandle");
    if (!last || dur <= 0) return;
    this.newCandle = { time: last.time, t0: performance.now(), dur };
    this.animate(dur);
  }

  /** Indicators that are not closing. */
  private activeIndicators(): [string, ActiveIndicator][] { return [...this.indicators].filter(([, i]) => !i.removing); }
  /** How far open an indicator is (0–1) while it opens or closes. */
  private indFactor(ind: ActiveIndicator, now = performance.now()): number {
    if (!ind.anim) return 1;
    const k = clamp01(this.ease(this.prog(ind.anim.t0, ind.anim.dur, now)));
    return ind.anim.to ? k : 1 - k;
  }

  /** Removes an overlay, fading it out. */
  private dropOverlay(id: string): void {
    const ov = this.overlays.get(id);
    if (!ov) return;
    this.overlays.delete(id);
    this.overlayBorn.delete(id);
    const dur = this.dur("overlays");
    if (dur > 0) { this.fading.set(id, { ov, t0: performance.now(), dur }); this.animate(dur); }
    this.markDirty();
  }
  /** Overlays to draw, with their opacity (fading in or out). */
  private drawnOverlays(): [Overlay, number][] {
    const now = performance.now(), out: [Overlay, number][] = [];
    for (const [id, ov] of this.overlays) {
      const b = this.overlayBorn.get(id);
      out.push([ov, b ? clamp01(this.ease(this.prog(b.t0, b.dur, now))) : 1]);
    }
    for (const f of this.fading.values()) out.push([f.ov, 1 - clamp01(this.ease(this.prog(f.t0, f.dur, now)))]);
    return out;
  }

  // ---------------------------------------------------------------- history pages

  private setHist(state: HistoryState): void {
    if (state === this.hist.state) return;
    this.hist.state = state;
    this.emit("historystate", { state });
    this.markDirty();
  }
  private cancelHistory(): void {
    this.hist.gen++;
    this.hist.abort?.abort();
    this.hist.abort = null;
  }

  /** Asks for older candles: the event first (respondWith), then the history loader. */
  private requestHistory(before: number): void {
    let answered = false;
    const respondWith = (candles: Promise<readonly Candle[]> | readonly Candle[]) => {
      if (answered) return;
      answered = true;
      this.loadHistory(() => candles, before);
    };
    this.emit("requesthistory", { before, count: this.opts.history.pageSize, respondWith });
    if (!answered && this.loader) { answered = true; this.loadHistory(this.loader, before); }
  }

  /** Loads one page (before = null: the latest page into an empty chart) and shows it loading meanwhile. */
  private loadHistory(load: HistoryLoader, before: number | null): void {
    this.cancelHistory();
    const gen = this.hist.gen;
    const abort = typeof AbortController !== "undefined" ? new AbortController() : null;
    this.hist.abort = abort;
    this.setHist("loading");
    const req: HistoryRequest = { before, count: this.opts.history.pageSize, timeframe: this.opts.timeframe, symbol: this.opts.symbol, signal: abort?.signal };
    let answer: Promise<readonly Candle[]>;
    try { answer = Promise.resolve(load(req)); } catch (e) { answer = Promise.reject(e); }
    answer.then((candles) => {
      if (gen !== this.hist.gen) return;
      this.hist.abort = null;
      const list = Array.isArray(candles) ? (candles as readonly Candle[]) : [];
      if (before === null) {
        // keep live candles that arrived while the page was loading
        const newer = this.store.all.slice();
        this.replaceData(list);
        for (const c of newer) this.store.upsert(c);
        if (newer.length) this.onDataChanged(false);
        this.setHist(list.length ? "idle" : "end");
      } else this.setHist(this.prependData(list) > 0 ? "idle" : "end");
    }, (err: unknown) => {
      if (gen !== this.hist.gen) return;
      this.hist.abort = null;
      console.warn("Tickline: loading history failed.", err);
      this.setHist("error");
    });
  }

  /** setData without touching the history state. Plays the intro when the chart was empty. */
  private replaceData(candles: readonly Candle[]): void {
    const wasEmpty = this.store.length === 0;
    this.store.set(candles);
    this.haCache = null;
    this.onDataChanged(true);
    if (wasEmpty && this.store.length) this.playIntro();
  }

  /** Space right of the live candle: from livePosition.x when set, else timeScale.rightPadding. */
  private rightPad(): number {
    const x = this.opts.livePosition.x;
    return x === null ? this.opts.timeScale.rightPadding : 1 - x;
  }

  private checkAlerts(prev: number, next: number, time: number): void {
    if (!Number.isFinite(prev) || prev === next) return;
    for (const [id, ov] of [...this.overlays]) {
      if (ov.kind !== "alert") continue;
      const p = ov.o.price;
      const up = prev < p && next >= p, down = prev > p && next <= p;
      if (!up && !down) continue;
      if (ov.o.once !== false) this.dropOverlay(id);
      this.emit("alert", { id, price: p, direction: up ? "up" : "down", time, label: ov.o.label });
    }
  }

  /** Draws one clean frame (optionally at another pixel ratio), hands the canvas over, then restores the view. */
  private renderForImage(o: ImageOptions, use: (c: HTMLCanvasElement) => void): void {
    const pointer = this.pointer, sync = this.syncTime, dpr = this.dpr;
    // the image shows the finished chart: end any intro, fade or zoom animation now
    this.intro = this.typeAnim = this.histFade = this.newCandle = null;
    if (this.viewAnim) { this.viewAnim.dur = 0; this.step(0); }
    this.overlayBorn.clear(); this.fading.clear();
    this.endAnimations(Infinity);
    if (!o.crosshair) { this.pointer = null; this.syncTime = null; }
    const ratio = o.pixelRatio && o.pixelRatio > 0 ? Math.min(8, o.pixelRatio) : dpr;
    if (ratio !== dpr) { this.dpr = ratio; this.canvas.width = Math.round(this.w * ratio); this.canvas.height = Math.round(this.h * ratio); }
    try {
      this.draw(performance.now());
      use(this.canvas);
    } finally {
      this.pointer = pointer; this.syncTime = sync;
      if (ratio !== dpr) { this.dpr = dpr; this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr); }
      this.draw(performance.now());
    }
  }

  // ---------------------------------------------------------------- formatting (settings: locale, format.*)

  private fmtPrice(v: number, dec: number): string {
    const f = this.opts.format.price;
    if (f) return f(v, dec);
    if (!this.opts.locale || !Number.isFinite(v)) return formatPrice(v, dec);
    const key = String(dec);
    let nf = this.numberFormats.get(key);
    if (!nf) { nf = new Intl.NumberFormat(this.opts.locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }); this.numberFormats.set(key, nf); }
    return nf.format(v);
  }

  private fmtTime(t: number, kind: TimeLabelKind): string {
    const tz = this.tz(t);
    if (this.opts.format.time) return this.opts.format.time(t, kind, tz);
    const full = (k: "seconds" | "minutes" | "date") => {
      if (!this.opts.locale) {
        const s = formatTime(t, "full", tz); // 2026-11-03 20:07:15
        return k === "seconds" ? s : k === "minutes" ? s.slice(0, 16) : s.slice(0, 10);
      }
      return this.intlDate(t, tz, "full-" + k, k === "date" ? { dateStyle: "medium" } : { dateStyle: "short", timeStyle: k === "seconds" ? "medium" : "short" });
    };
    if (kind === "crosshair") return full(this.tf.ms < MS.MIN ? "seconds" : this.tf.ms < MS.DAY ? "minutes" : "date");
    if (kind === "drawing") return this.opts.locale ? full("minutes") : formatTime(t, "full", tz).slice(5, 16);
    if (kind === "full") return full("seconds");
    if (!this.opts.locale) return formatTime(t, kind, tz);
    const d = new Date(t + tz * MS.MIN);
    switch (kind) {
      case "seconds": return this.intlDate(t, tz, kind, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      case "minutes": return this.intlDate(t, tz, kind, { hour: "2-digit", minute: "2-digit" });
      case "month": return d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : this.intlDate(t, tz, kind, { month: "short", year: "numeric" });
      default: return this.intlDate(t, tz, "day", { day: "numeric", month: "short" });
    }
  }

  /** Intl date formatting at a fixed offset: shift the time and format it as UTC. */
  private intlDate(t: number, tz: number, key: string, o: Intl.DateTimeFormatOptions): string {
    let f = this.dateFormats.get(key);
    if (!f) { f = new Intl.DateTimeFormat(this.opts.locale, { ...o, timeZone: "UTC" }); this.dateFormats.set(key, f); }
    return f.format(new Date(t + tz * MS.MIN));
  }

  private fmtCountdown(ms: number): string { return this.opts.format.countdown ? this.opts.format.countdown(ms) : formatCountdown(ms); }

  /** A font from the base size: delta px larger or smaller. */
  private font(delta: number, weight = "", mono = true): string {
    return `${weight} ${this.opts.layout.fontSize + delta}px ${mono ? this.theme.monoFont : this.theme.font}`.trim();
  }

  private addOverlay(ov: Overlay): string {
    const id = "tl" + this.nextId++;
    this.overlays.set(id, ov);
    const dur = this.dur("overlays");
    if (dur > 0) { this.overlayBorn.set(id, { t0: performance.now(), dur }); this.animate(dur); }
    this.markDirty();
    return id;
  }

  private onDataChanged(reset: boolean): void {
    this.dataVersion++;
    if (reset) {
      const last = this.store.last;
      this.displayPrice = last ? last.close : NaN;
      this.scaleReady = false;
      this.manualScale = false;
      this.historyRequestedFor = NaN;
      this.following = true;
      this.viewAnim = null;
      this.histFade = null;
      this.newCandle = null;
    }
    this.markDirty();
  }

  private precision(): number {
    if (typeof this.opts.precision === "number") return this.opts.precision;
    const last = this.store.last;
    return last ? autoPrecision(last.close) : 2;
  }

  private tz(t: number): number {
    return this.opts.timezone === "local" ? -new Date(t).getTimezoneOffset() : this.opts.timezone;
  }

  /** The time the right side of the data reaches: now for live data, else the end of the last candle. */
  private liveTime(): number {
    const last = this.store.last;
    const now = Date.now();
    if (!last) return now;
    const end = this.store.endOf(last);
    return now - end < 3 * this.tf.ms ? Math.max(now, this.store.lastTickTime) : end;
  }
  private isLive(): boolean {
    const last = this.store.last;
    return !!last && Date.now() - this.store.endOf(last) < 3 * this.tf.ms;
  }

  private axisH(): number { return this.opts.timeScale.visible ? this.opts.layout.timeAxisHeight : 0; }
  private plotW(): number { return Math.max(1, this.w - this.axisW); }
  private plotH(): number { return Math.max(1, this.h - this.axisH()); }
  private minMsPerPx(): number { return (this.tf.ms * this.opts.timeScale.minVisibleCandles) / this.plotW(); }
  private maxMsPerPx(): number { return (this.tf.ms * this.opts.timeScale.maxVisibleCandles) / this.plotW(); }
  private defaultMsPerPx(): number { return (this.tf.ms * this.opts.timeScale.defaultVisibleCandles) / this.plotW(); }

  private timeToX(t: number): number { return this.plotW() - (this.rightTime - t) / this.msPerPx; }
  private xToTime(x: number): number { return this.rightTime - (this.plotW() - x) * this.msPerPx; }
  /** Height of the price pane (the rest goes to indicator panes). */
  private mainH(): number { return this.layoutBoxes[0]?.h ?? this.plotH(); }
  /** Room at the top of the price pane for the legend (one more row when price indicators are on). */
  private padTop(): number {
    const lg = this.opts.legend;
    const row = lg.visible && lg.indicators && this.activeIndicators().some(([, i]) => i.def.placement === "main");
    return this.opts.layout.paddingTop + (row ? this.opts.layout.fontSize + 7 : 0);
  }

  private computeLayout(): PaneBox[] {
    const ph = this.plotH();
    const subs = [...this.indicators.entries()].filter(([, i]) => i.def.placement === "pane");
    const now = performance.now();
    const open = subs.map(([, i]) => this.indFactor(i, now));
    let fracs = subs.map(([, i], n) => i.frac * open[n]);
    const total = fracs.reduce((a, b) => a + b, 0);
    const cap = this.opts.layout.paneMaxShare;
    if (total > cap) fracs = fracs.map((f) => (f * cap) / total); // the price pane keeps the rest
    const heights = fracs.map((f, n) => Math.round(Math.max(this.opts.layout.paneMinHeight * open[n], f * ph)));
    const mainH = Math.max(80, ph - heights.reduce((a, b) => a + b, 0));
    const boxes: PaneBox[] = [{ key: null, top: 0, h: mainH }];
    let top = mainH;
    subs.forEach(([key], i) => { boxes.push({ key, top, h: heights[i] }); top += heights[i]; });
    return boxes;
  }

  private priceToY(p: number): number {
    const top = this.padTop(), bottom = this.mainH() - this.opts.layout.paddingBottom;
    return bottom - ((p - this.priceMin) / (this.priceMax - this.priceMin || 1)) * (bottom - top);
  }
  private yToPrice(y: number): number {
    const top = this.padTop(), bottom = this.mainH() - this.opts.layout.paddingBottom;
    return this.priceMin + ((bottom - y) / (bottom - top)) * (this.priceMax - this.priceMin);
  }

  private setFollowing(f: boolean): void {
    if (f === this.following) return;
    this.following = f;
    this.emit("followchange", { following: f });
  }

  private zoomAt(x: number, factor: number, o: AnimateOptions = {}): void {
    if (!this.msPerPx) return;
    const va = this.viewAnim;
    // zooming again while a zoom animates continues from where that one was heading
    const base = va ? va.toMs : this.msPerPx;
    if (factor < 1 && base <= this.minMsPerPx() * 1.001) { this.emit("zoomlimit", { minCandles: this.opts.timeScale.minVisibleCandles }); return; }
    const target = this.clampMs(base * factor);
    if (this.following && !(va && va.toRight === "live")) this.tweenView(target, {}, this.viewDur("zoom", o));
    else if (this.following) this.tweenView(target, { right: "live" }, this.viewDur("zoom", o));
    else this.tweenView(target, { anchor: { x, time: this.xToTime(x) } }, this.viewDur("zoom", o));
  }

  private resize(): void {
    // when shown rotated, the on-screen box is turned; the layout size is the chart's own size
    const r = this.rotation ? { width: this.container.offsetWidth, height: this.container.offsetHeight } : this.container.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    const dpr = Math.min(3, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    // time per pixel stays the same, so candles keep their width and a wider chart shows more history
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.markDirty();
    this.frame(performance.now(), true);
  }

  // ================================================================ render loop

  private markDirty(): void { this.dirty = true; this.kick(); }

  private kick(): void {
    if (this.raf || !this.visible || (typeof document !== "undefined" && document.hidden)) return;
    this.raf = requestAnimationFrame((t) => { this.raf = 0; this.frame(t, false); });
  }

  private frame(now: number, force: boolean): void {
    const minGap = 1000 / Math.max(1, this.opts.fps);
    const live = this.isLive() && this.following;
    const gliding = Number.isFinite(this.displayPrice) && this.store.last && Math.abs(this.displayPrice - this.store.last.close) > 1e-12;
    const animating = live || gliding || now < this.animUntil || (this.animated && this.isLive())
      || (this.animated && (this.layers.some((l) => l.animate) || this.hist.state === "loading" || (this.loadingOn && !this.store.length)));
    if (!force && !this.dirty && !animating) return;
    if (!force && now - this.lastFrame < minGap - 1) { this.kick(); return; }
    const dt = Math.min(250, now - (this.lastFrame || now));
    this.lastFrame = now;
    this.dirty = false;
    this.step(dt, now);
    this.draw(now);
    if (animating) this.kick();
  }

  /** Advances animated values: live price glide, scrolling, price-scale easing. */
  private step(dt: number, now = performance.now()): void {
    const last = this.store.last;
    const speed = this.opts.animation.speed;
    if (!this.msPerPx) this.msPerPx = this.clampMs(this.defaultMsPerPx());
    // live price glides towards the last tick
    if (last) {
      if (!Number.isFinite(this.displayPrice) || !this.animated) this.displayPrice = last.close;
      else this.displayPrice += (last.close - this.displayPrice) * (1 - Math.exp(-dt / Math.max(1, this.opts.animation.priceSmoothing / speed)));
      if (Math.abs(last.close - this.displayPrice) < Math.abs(last.close) * 1e-9) this.displayPrice = last.close;
    }
    // zoom and scroll animations
    const va = this.viewAnim;
    if (va) {
      const p = this.prog(va.t0, va.dur, now), k = this.ease(p);
      this.msPerPx = va.fromMs * Math.pow(va.toMs / va.fromMs, k);
      if (va.anchor) this.rightTime = va.anchor.time + (this.plotW() - va.anchor.x) * this.msPerPx;
      else if (va.toRight !== null) {
        const to = va.toRight === "live" ? this.liveRight() : va.toRight;
        this.rightTime = va.fromRight + (to - va.fromRight) * k;
      }
      if (p >= 1) this.viewAnim = null;
    }
    // the view follows the live edge, with empty space on the right
    if (this.following && !(this.viewAnim && this.viewAnim.toRight === "live")) this.rightTime = this.liveRight();
    this.endAnimations(now);
    // price axis fits the visible candles, easing so it never jumps (unless it was set by hand)
    const target = this.manualScale && this.scaleReady ? null : this.visibleExtent();
    if (target) {
      const [lo, hi] = target;
      const k = 1 - Math.exp(-dt / Math.max(1, this.opts.animation.scaleSmoothing / speed));
      const ly = this.opts.livePosition.y;
      if (ly !== null && this.following && Number.isFinite(this.displayPrice)) {
        // keep the live price at a fixed height: choose a range that holds every visible price with it there
        const top = this.padTop(), bottom = this.mainH() - this.opts.layout.paddingBottom;
        const a = Math.min(0.98, Math.max(0.02, (ly * this.mainH() - top) / Math.max(1, bottom - top)));
        const p = this.displayPrice;
        const span = Math.max(hi - lo, (hi - p) / a, (p - lo) / (1 - a));
        const cur = this.priceMax - this.priceMin;
        const next = !this.scaleReady || !this.animated || !(cur > 0) ? span : cur + (span - cur) * k;
        this.priceMax = p + a * next;
        this.priceMin = this.priceMax - next;
        this.scaleReady = true;
      } else if (!this.scaleReady || !this.animated) { this.priceMin = lo; this.priceMax = hi; this.scaleReady = true; }
      else {
        this.priceMin += (lo - this.priceMin) * k;
        this.priceMax += (hi - this.priceMax) * k;
      }
    }
    // history: ask for more when the left edge nears the first candle
    const first = this.store.first;
    const leftTime = this.xToTime(0);
    if (first && this.opts.history.request && this.hist.state === "idle" && leftTime < first.time + this.plotW() * this.opts.history.threshold * this.msPerPx && this.historyRequestedFor !== first.time) {
      this.historyRequestedFor = first.time;
      this.requestHistory(first.time);
    }
    this.trimHistory(leftTime);
    const range = { from: leftTime, to: this.rightTime };
    if (Math.abs(range.from - this.lastRange.from) > this.msPerPx || Math.abs(range.to - this.lastRange.to) > this.msPerPx) {
      this.lastRange = range;
      this.emit("rangechange", range);
    }
  }

  /** Clears animations that have finished. */
  private endAnimations(now: number): void {
    if (this.intro && this.prog(this.intro.t0, this.intro.dur, now) >= 1) this.intro = null;
    if (this.newCandle && this.prog(this.newCandle.t0, this.newCandle.dur, now) >= 1) this.newCandle = null;
    if (this.typeAnim && this.prog(this.typeAnim.t0, this.typeAnim.dur, now) >= 1) this.typeAnim = null;
    if (this.histFade && this.prog(this.histFade.t0, this.histFade.dur, now) >= 1) this.histFade = null;
    for (const [id, b] of this.overlayBorn) if (this.prog(b.t0, b.dur, now) >= 1) this.overlayBorn.delete(id);
    for (const [id, f] of this.fading) if (this.prog(f.t0, f.dur, now) >= 1) this.fading.delete(id);
    for (const [key, ind] of this.indicators) {
      if (!ind.anim || this.prog(ind.anim.t0, ind.anim.dur, now) < 1) continue;
      if (ind.removing) this.indicators.delete(key); else ind.anim = null;
    }
  }

  /** Above history.maxCandles, drops the oldest candles that are well out of view. */
  private trimHistory(leftTime: number): void {
    const max = this.opts.history.maxCandles;
    if (!(max > 0) || this.store.length <= max || this.drag || this.hist.state === "loading") return;
    const leftIdx = this.store.indexAtOrAfter(leftTime);
    const inView = Math.max(0, this.store.indexAtOrAfter(this.rightTime) - leftIdx);
    const n = Math.min(this.store.length - max, leftIdx - Math.max(inView, this.opts.history.pageSize));
    if (n <= 0) return;
    this.store.dropOldest(n);
    this.haCache = null;
    this.historyRequestedFor = NaN;
    if (this.hist.state === "end") this.setHist("idle");
    this.dataVersion++;
  }

  private series(type: ChartType = this.opts.type): readonly Candle[] {
    return type === "heikin-ashi" ? this.heikin() : this.store.all;
  }

  /** Heikin-Ashi candles, updated at the end when only the newest candles changed. */
  private heikin(): Candle[] {
    const src = this.store.all, c = this.haCache;
    if (c && c.version === this.dataVersion) return c.data;
    const out = c && src.length >= c.data.length ? c.data : [];
    const start = Math.max(0, out.length - 1);
    out.length = start;
    for (let i = start; i < src.length; i++) {
      const k = src[i], prev = out[i - 1];
      const close = (k.open + k.high + k.low + k.close) / 4;
      const open = prev ? (prev.open + prev.close) / 2 : (k.open + k.close) / 2;
      out.push({ time: k.time, open, close, high: Math.max(k.high, open, close), low: Math.min(k.low, open, close), volume: k.volume });
    }
    this.haCache = { version: this.dataVersion, data: out };
    return out;
  }

  /** Candles in view (with one extra on each side), and the live candle adjusted to the gliding price. */
  private visibleCandles(type: ChartType = this.opts.type): { list: readonly Candle[]; from: number; to: number } {
    const all = this.series(type);
    const from = Math.max(0, this.store.indexAtOrAfter(this.xToTime(0) - this.tf.ms) - 1);
    const to = Math.min(all.length, this.store.indexAtOrAfter(this.xToTime(this.plotW()) + this.tf.ms) + 1);
    return { list: all, from, to };
  }

  private liveCandle(c: Candle, isLast: boolean, type: ChartType = this.opts.type): Candle {
    if (!isLast || !Number.isFinite(this.displayPrice) || type === "heikin-ashi") return c;
    const p = this.displayPrice;
    return { ...c, close: p, high: Math.max(c.high, p), low: Math.min(c.low, p) };
  }

  private visibleExtent(): [number, number] | null {
    const { list, from, to } = this.visibleCandles();
    let lo = Infinity, hi = -Infinity;
    const left = this.xToTime(0), right = this.xToTime(this.plotW());
    for (let i = from; i < to; i++) {
      const c = list[i];
      if (c.time + this.tf.ms < left || c.time > right) continue;
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    if (Number.isFinite(this.displayPrice) && this.store.last && this.store.last.time <= right) {
      lo = Math.min(lo, this.displayPrice); hi = Math.max(hi, this.displayPrice);
    }
    for (const [, ind] of this.activeIndicators()) {
      if (ind.def.placement !== "main" || !this.opts.priceScale.includeIndicators) continue;
      const { out, off } = this.output(ind);
      for (const line of out.lines) for (let i = from; i < to; i++) {
        const v = line.values[i - off];
        if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
    }
    if (!Number.isFinite(lo)) {
      const last = this.store.last;
      if (!last) return null;
      lo = last.low; hi = last.high;
    }
    if (hi - lo < Math.abs(hi) * 1e-6) { const pad = Math.abs(hi) * 0.001 || 1; lo -= pad; hi += pad; }
    const pad = (hi - lo) * Math.max(0, this.opts.priceScale.margin);
    return [lo - pad, hi + pad];
  }

  // ================================================================ drawing

  private draw(now: number): void {
    const { ctx, theme: th } = this;
    const dec = this.precision();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = th.background;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.msPerPx) return;

    // axis width from the widest label
    ctx.font = this.font(0);
    const sample = this.fmtPrice(Math.max(Math.abs(this.priceMax), Math.abs(this.priceMin)), dec);
    this.axisW = this.opts.priceScale.visible ? Math.max(this.opts.layout.priceAxisMinWidth, Math.ceil(ctx.measureText(sample).width + 34)) : 0;
    const pw = this.plotW(), ph = this.plotH();
    this.layoutBoxes = this.computeLayout();
    this.hits = [];
    const mh = this.mainH();

    // grid + axes
    const pTicks = priceTicks(this.priceMin, this.priceMax, Math.max(2, Math.floor((mh - this.padTop()) / Math.max(16, this.opts.priceScale.labelSpacing))));
    const pStep = pTicks.length > 1 ? pTicks[1] - pTicks[0] : niceStep(this.priceMax - this.priceMin, 4);
    const left = this.xToTime(0), right = this.xToTime(pw);
    const tTicks = timeTicks(left, right, Math.max(20, this.opts.timeScale.labelSpacing) * this.msPerPx, this.tz(right));
    if (this.opts.format.time || this.opts.locale) for (const t of tTicks) t.label = this.fmtTime(t.time, t.kind);
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.grid;
    ctx.beginPath();
    if (this.opts.grid.horizontal) for (const p of pTicks) { const y = crisp(this.priceToY(p)); if (y < mh) { ctx.moveTo(0, y); ctx.lineTo(pw, y); } }
    if (this.opts.grid.vertical) for (const t of tTicks) { const x = crisp(this.timeToX(t.time)); ctx.moveTo(x, 0); ctx.lineTo(x, ph); }
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, mh);
    ctx.clip();
    this.drawWatermark();
    this.drawZones();
    this.drawShapes("below");
    this.drawLayers("below", now);
    if (this.typeAnim) {
      const k = clamp01(this.ease(this.prog(this.typeAnim.t0, this.typeAnim.dur, now)));
      ctx.globalAlpha = 1 - k; this.drawSeries(this.typeAnim.from, now);
      ctx.globalAlpha = k; this.drawSeries(this.opts.type, now);
      ctx.globalAlpha = 1;
    } else this.drawSeries(this.opts.type, now);
    this.drawHistoryState(now);
    if (this.opts.series.highLowLabels) this.drawHighLow(dec);
    this.drawMainIndicators();
    this.drawOverlays();
    this.drawShapes("above");
    this.drawLayers("above", now);
    this.drawDrawings(dec);
    this.drawLivePoint(now);
    ctx.restore();
    this.drawPanes();
    this.drawDrawingTags(dec);

    // axis lines
    ctx.strokeStyle = th.axisLine;
    ctx.beginPath();
    ctx.moveTo(crisp(pw), 0); ctx.lineTo(crisp(pw), ph);
    ctx.moveTo(0, crisp(ph)); ctx.lineTo(this.w, crisp(ph));
    ctx.stroke();

    // price labels
    ctx.fillStyle = th.text;
    ctx.font = this.font(0);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const labelDec = Math.max(stepDecimals(pStep), 0);
    // no candles yet: no made-up prices on the axis
    if (this.opts.priceScale.visible && this.store.length) for (const p of pTicks) {
      const y = this.priceToY(p);
      if (y < 8 || y > mh - 8) continue;
      ctx.fillText(this.fmtPrice(p, Math.min(dec, labelDec)), pw + 10, y);
    }
    // time labels
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (this.opts.timeScale.visible) for (const t of tTicks) {
      const x = this.timeToX(t.time);
      if (x < 24 || x > pw - 24) continue;
      ctx.fillStyle = t.major ? th.textStrong : th.text;
      ctx.fillText(t.label, x, ph + this.axisH() / 2);
    }

    this.drawPriceLineLabels(dec);
    this.drawLiveTag(dec);
    this.drawCrosshair(dec);
    this.drawLegend(dec);
    this.drawLayers("top", now);
    if (!this.store.length && (this.loadingOn || this.hist.state === "loading" || this.hist.state === "error")) this.drawSkeleton(now);
    else if (this.loadingOn) this.drawLoading();
  }

  /** How far the intro has got (1 when it isn't playing). */
  private introProgress(now = performance.now()): number { return this.intro ? this.prog(this.intro.t0, this.intro.dur, now) : 1; }
  /** Growth (0–1) of a candle at x during the intro: they rise in from left to right. */
  private introK(p: number, x: number): number {
    const xf = clamp01(x / this.plotW());
    return this.ease(clamp01((p - xf * 0.6) / 0.4));
  }
  /** Clips to the part revealed so far by the intro (lines, areas and indicators draw in from the left). */
  private clipIntro(top: number, h: number, now: number): boolean {
    const p = this.introProgress(now);
    if (p >= 1) return false;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, top, Math.max(0, clamp01(this.ease(p)) * (this.plotW() + 2)), h);
    this.ctx.clip();
    return true;
  }

  private drawSeries(type: ChartType, now: number): void {
    const { ctx } = this;
    const { list, from, to } = this.visibleCandles(type);
    if (to <= from) return;
    const hf = this.histFade;
    if (hf) {
      // a page of older candles fades in
      const base = ctx.globalAlpha;
      const split = Math.min(to, Math.max(from, this.store.indexAtOrAfter(hf.before)));
      if (split > from) { ctx.globalAlpha = base * clamp01(this.ease(this.prog(hf.t0, hf.dur, now))); this.drawSeriesRange(type, list, from, Math.min(to, split + 1), now); ctx.globalAlpha = base; }
      if (split < to) this.drawSeriesRange(type, list, split, to, now);
      return;
    }
    this.drawSeriesRange(type, list, from, to, now);
  }

  private drawSeriesRange(type: ChartType, list: readonly Candle[], from: number, to: number, now: number): void {
    const { ctx, theme: th } = this;
    const lastIdx = list.length - 1;
    const candlePx = this.tf.ms / this.msPerPx;

    if (type === "line" || type === "area") {
      const clipped = this.clipIntro(0, this.mainH(), now);
      const live = this.liveTime();
      const pts: [number, number][] = [];
      for (let i = from; i < to; i++) {
        const c = this.liveCandle(list[i], i === lastIdx, type);
        const t = i === lastIdx ? live : Math.min(this.store.endOf(c), live);
        pts.push([this.timeToX(t), this.priceToY(c.close)]);
      }
      if (type === "area" && pts.length > 1) {
        const g = ctx.createLinearGradient(0, this.padTop(), 0, this.mainH());
        g.addColorStop(0, th.areaTop);
        g.addColorStop(1, th.areaBottom);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], this.mainH());
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.lineTo(pts[pts.length - 1][0], this.mainH());
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = th.line;
      ctx.lineWidth = this.opts.series.lineWidth;
      ctx.lineJoin = "round";
      ctx.stroke();
      if (clipped) ctx.restore();
      return;
    }

    const bodyW = Math.max(1, Math.min(candlePx * this.opts.series.candleWidth, candlePx - 1));
    const thin = bodyW < 3;
    const wicks = this.opts.series.wicks;
    // intro: candles grow out of their open, left to right; a new candle widens in
    const ip = this.introProgress(now);
    const nc = this.newCandle;
    const ncK = nc ? this.ease(this.prog(nc.t0, nc.dur, now)) : 1;
    const shaped = (i: number): { c: Candle; cx: number; w: number } | null => {
      let c = this.liveCandle(list[i], i === lastIdx, type);
      const cx = this.timeToX(c.time + this.tf.ms / 2);
      let k = ip < 1 ? this.introK(ip, cx) : 1, w = bodyW;
      if (nc && c.time === nc.time) { k = Math.min(k, ncK); w = Math.max(1, bodyW * (0.2 + 0.8 * clamp01(ncK))); }
      if (k <= 0.01) return null;
      if (k !== 1) c = { ...c, close: c.open + (c.close - c.open) * k, high: c.open + (c.high - c.open) * k, low: c.open + (c.low - c.open) * k };
      return { c, cx, w };
    };
    for (const dir of [1, -1]) {
      ctx.fillStyle = ctx.strokeStyle = dir > 0 ? th.up : th.down;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        const sh = shaped(i);
        if (!sh) continue;
        const { c, cx } = sh;
        const up = c.close >= c.open;
        if ((dir > 0) !== up) continue;
        const bodyW = sh.w;
        const yH = this.priceToY(c.high), yL = this.priceToY(c.low);
        const yO = this.priceToY(c.open), yC = this.priceToY(c.close);
        if (type === "bars") {
          const x = crisp(cx), tick = Math.max(2, bodyW / 2);
          ctx.moveTo(x, yH); ctx.lineTo(x, yL);
          ctx.moveTo(x - tick, crisp(yO)); ctx.lineTo(x, crisp(yO));
          ctx.moveTo(x, crisp(yC)); ctx.lineTo(x + tick, crisp(yC));
          continue;
        }
        const x = crisp(cx);
        const top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
        // wick (skip the part behind the body)
        if (wicks || thin) { ctx.moveTo(x, yH); ctx.lineTo(x, top); ctx.moveTo(x, top + bh); ctx.lineTo(x, yL); }
        if (thin) { ctx.moveTo(x, top); ctx.lineTo(x, top + bh); continue; }
        if (type === "hollow" && up) ctx.rect(Math.round(cx - bodyW / 2) + 0.5, Math.round(top) + 0.5, Math.round(bodyW) - 1, Math.max(1, Math.round(bh) - 1));
      }
      ctx.stroke();
      if (type === "bars" || thin) continue;
      // bodies
      for (let i = from; i < to; i++) {
        const sh = shaped(i);
        if (!sh) continue;
        const { c, cx } = sh;
        const bodyW = sh.w;
        const up = c.close >= c.open;
        if ((dir > 0) !== up || (type === "hollow" && up)) continue;
        const yO = this.priceToY(c.open), yC = this.priceToY(c.close);
        const top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
        ctx.fillRect(Math.round(cx - bodyW / 2), Math.round(top), Math.round(bodyW), Math.max(1, Math.round(bh)));
      }
    }
  }

  /** Shapes added with addShape, under or over the candles. */
  private drawShapes(z: "below" | "above"): void {
    const { ctx, theme: th } = this;
    for (const [ov, a] of this.drawnOverlays()) {
      if (ov.kind !== "shape" || (ov.o.zIndex ?? "above") !== z || a <= 0) continue;
      const o = ov.o;
      const pts = o.points.map((q) => this.toXY(q));
      if (!pts.length) continue;
      ctx.save();
      ctx.globalAlpha = clamp01((o.opacity ?? 1) * a);
      const color = o.color ?? th.accent;
      ctx.strokeStyle = color;
      ctx.lineWidth = o.width ?? 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(dash(o.style ?? "solid"));
      const finish = (closed: boolean) => {
        if (o.fill && closed) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.width !== 0) ctx.stroke();
      };
      ctx.beginPath();
      switch (o.type) {
        case "line":
        case "arrow":
          if (pts.length < 2) break;
          ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
          ctx.stroke();
          if (o.type === "arrow") { ctx.setLineDash([]); arrowHead(ctx, pts[0], pts[1], o.headSize ?? 9, color); }
          break;
        case "circle": {
          const r = o.radius ?? (pts[1] ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 6);
          ctx.arc(pts[0].x, pts[0].y, Math.max(0, r), 0, Math.PI * 2);
          finish(true);
          break;
        }
        case "ellipse":
          if (pts.length < 2) break;
          ctx.ellipse((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, Math.abs(pts[1].x - pts[0].x) / 2, Math.abs(pts[1].y - pts[0].y) / 2, 0, 0, Math.PI * 2);
          finish(true);
          break;
        case "rect":
          if (pts.length < 2) break;
          ctx.rect(Math.min(pts[0].x, pts[1].x), Math.min(pts[0].y, pts[1].y), Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y));
          finish(true);
          break;
        case "polygon":
        case "path":
          pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          if (o.type === "polygon" || o.closed) ctx.closePath();
          finish(o.type === "polygon" || !!o.closed);
          break;
        case "image": {
          const img = this.image(o.src);
          const w = o.imageWidth ?? 24, h = o.imageHeight ?? 24;
          const dx = o.align === "left" ? 0 : o.align === "right" ? -w : -w / 2;
          const dy = o.baseline === "top" ? 0 : o.baseline === "bottom" ? -h : -h / 2;
          if (img) ctx.drawImage(img, pts[0].x + dx, pts[0].y + dy, w, h);
          break;
        }
        case "text": break;
      }
      // text: the text shape itself, or a label beside another shape
      if (o.text) {
        ctx.setLineDash([]);
        const size = o.fontSize ?? this.opts.layout.fontSize + 1;
        const font = `${o.fontWeight ?? (o.type === "text" ? 600 : 500)} ${size}px ${th.font}`;
        const at = o.type === "text" || o.type === "image" ? pts[0] : o.type === "circle" ? { x: pts[0].x, y: pts[0].y } : pts[pts.length - 1];
        const align = o.align ?? (o.type === "text" ? "center" : "left");
        const baseline = o.baseline ?? (o.type === "text" || o.type === "circle" ? "middle" : "bottom");
        const r = o.type === "circle" ? o.radius ?? (pts[1] ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 6) : 0;
        const off = o.type === "text" ? { x: 0, y: 0 } : o.type === "image" ? { x: 0, y: (o.imageHeight ?? 24) / 2 + 4 } : o.type === "circle" ? { x: r + 6, y: 0 } : { x: 6, y: -4 };
        drawText(ctx, o.text, at.x + off.x, at.y + off.y, { font, color: o.textColor ?? (o.background ? th.overlayText : color), background: o.background, align, baseline: o.type === "image" ? "top" : baseline });
      }
      ctx.restore();
    }
  }

  /** Loads (once) and returns an image for image shapes; redraws when it arrives. */
  private image(src?: string): HTMLImageElement | null {
    if (!src || typeof Image === "undefined") return null;
    if (this.images.has(src)) { const img = this.images.get(src)!; return img && img.complete && img.naturalWidth ? img : null; }
    const img = new Image();
    img.crossOrigin = "anonymous"; // keeps the canvas exportable as an image when the server allows it
    img.onload = () => this.markDirty();
    img.onerror = () => this.images.set(src, null);
    img.src = src;
    this.images.set(src, img);
    return null;
  }

  private drawLayers(z: "below" | "above" | "top", now: number): void {
    if (!this.layers.some((l) => l.z === z)) return;
    const { ctx } = this;
    const last = this.store.last;
    const lineType = this.opts.type === "line" || this.opts.type === "area";
    const live = last && Number.isFinite(this.displayPrice)
      ? { time: last.time, price: this.displayPrice, x: lineType ? this.timeToX(this.liveTime()) : this.timeToX(last.time + this.tf.ms / 2), y: this.priceToY(this.displayPrice) }
      : null;
    const { list, from, to } = this.visibleCandles();
    const api: LayerContext = {
      timeToX: (t) => this.timeToX(t), xToTime: (x) => this.xToTime(x),
      priceToY: (p) => this.priceToY(p), yToPrice: (y) => this.yToPrice(y),
      width: this.plotW(), height: this.mainH(), now, theme: { ...this.theme }, live,
      range: { from: this.xToTime(0), to: this.xToTime(this.plotW()) },
      candles: list.slice(from, to),
    };
    for (const l of this.layers) {
      if (l.z !== z) continue;
      ctx.save();
      try { l.draw(ctx, api); } catch (e) { console.error(e); }
      ctx.restore();
    }
  }

  private drawWatermark(): void {
    const wm = this.opts.watermark;
    if (!wm.text) return;
    const { ctx, theme: th } = this;
    const text = wm.text.replace("{symbol}", this.opts.symbol).replace("{timeframe}", this.opts.timeframe).trim();
    if (!text) return;
    const pw = this.plotW(), mh = this.mainH();
    let size = wm.fontSize > 0 ? wm.fontSize : Math.max(18, Math.min(96, mh / 4));
    ctx.font = `700 ${size}px ${th.font}`;
    const w = ctx.measureText(text).width;
    if (!(wm.fontSize > 0) && w > pw * 0.8) { size = Math.max(14, (size * pw * 0.8) / w); ctx.font = `700 ${size}px ${th.font}`; }
    ctx.fillStyle = wm.color || withAlpha(th.text, 0.12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, pw / 2, (this.padTop() + mh) / 2);
  }

  /** Small labels at the highest high and lowest low in view. */
  private drawHighLow(dec: number): void {
    const { ctx, theme: th } = this;
    const { list, from, to } = this.visibleCandles();
    const left = this.xToTime(0), right = this.xToTime(this.plotW());
    let hi = -1, lo = -1;
    for (let i = from; i < to; i++) {
      const c = list[i];
      if (c.time + this.tf.ms < left || c.time > right) continue;
      if (hi < 0 || c.high > list[hi].high) hi = i;
      if (lo < 0 || c.low < list[lo].low) lo = i;
    }
    if (hi < 0) return;
    ctx.font = this.font(-1);
    ctx.fillStyle = th.textStrong;
    ctx.textAlign = "center";
    const label = (i: number, price: number, above: boolean) => {
      const x = Math.min(this.plotW() - 40, Math.max(40, this.timeToX(list[i].time + this.tf.ms / 2)));
      ctx.textBaseline = above ? "bottom" : "top";
      ctx.fillText(this.fmtPrice(price, dec), x, this.priceToY(price) + (above ? -4 : 4));
    };
    label(hi, list[hi].high, true);
    label(lo, list[lo].low, false);
  }

  /** Placeholder candles between x0 and x1, with a shimmer passing over them. */
  private drawGhostCandles(x0: number, x1: number, now: number, mid: number, amp: number, seed: number): void {
    const { ctx, theme: th } = this;
    if (x1 - x0 < 2) return;
    const candlePx = Math.max(6, this.tf.ms / this.msPerPx);
    const bodyW = Math.max(2, candlePx * 0.6);
    ctx.save();
    ctx.beginPath();
    let price = mid;
    for (let x = x1 - candlePx / 2, n = 0; x > x0 - candlePx; x -= candlePx, n++) {
      // a calm random walk, the same every frame
      const r = hash(seed + n), r2 = hash(seed + n + 7919);
      const open = price, close = price + (r - 0.5) * amp * 0.5;
      price = Math.max(mid - amp, Math.min(mid + amp, close));
      const hi = Math.max(open, close) + r2 * amp * 0.2, lo = Math.min(open, close) - (1 - r2) * amp * 0.2;
      const yH = this.priceToY(hi), yL = this.priceToY(lo);
      ctx.rect(Math.round(x - bodyW / 2), Math.min(yH, yL), Math.round(bodyW), Math.max(2, Math.abs(yL - yH)));
    }
    const base = withAlpha(th.text, 0.1), shine = withAlpha(th.text, 0.22);
    if (this.animated) {
      const w = x1 - x0, sweep = x0 - 160 + (((now / 1100) % 1) * (w + 320));
      const g = ctx.createLinearGradient(sweep - 160, 0, sweep + 160, 0);
      g.addColorStop(0, base); g.addColorStop(0.5, shine); g.addColorStop(1, base);
      ctx.fillStyle = g;
    } else ctx.fillStyle = base;
    ctx.fill();
    ctx.restore();
  }

  /** Older candles loading, failed, or the start of history: shown at the left of the price pane. */
  private drawHistoryState(now: number): void {
    const st = this.hist.state, first = this.store.first;
    if (!first || st === "idle") return;
    const { ctx, theme: th } = this;
    const L = this.opts.labels, pw = this.plotW(), mh = this.mainH();
    const fx = this.timeToX(first.time);
    if (fx < -40 && st !== "error") return;
    const y = (this.padTop() + mh) / 2;
    if (st === "loading") {
      const amp = (this.priceMax - this.priceMin) * 0.12;
      if (fx > 0) this.drawGhostCandles(0, fx, now, (first.open + first.close) / 2, amp, Math.round(first.time / this.tf.ms));
      const x = fx > 200 ? fx / 2 : 8;
      pill(ctx, L.loadingHistory, x, y, { bg: withAlpha(th.background, 0.9), fg: th.text, font: this.font(0, "500", false), align: fx > 200 ? "center" : "left", border: th.axisLine });
    } else if (st === "end") {
      if (fx < 0 || fx > pw) return;
      ctx.strokeStyle = th.axisLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(crisp(fx), this.padTop()); ctx.lineTo(crisp(fx), mh); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = this.font(-1, "500", false);
      ctx.fillStyle = th.text;
      ctx.textBaseline = "top";
      const w = ctx.measureText(L.historyStart).width;
      ctx.textAlign = fx > w + 12 ? "right" : "left";
      ctx.fillText(L.historyStart, fx > w + 12 ? fx - 6 : fx + 6, this.padTop() + 4);
    } else if (st === "error") {
      this.errorPill(Math.max(8, Math.min(fx > 0 ? fx / 2 : 8, pw - 8)), y, fx > 260 ? "center" : "left");
    }
  }

  /** "Couldn't load older data · Retry" with a hit area that retries. */
  private errorPill(x: number, y: number, align: "left" | "center"): void {
    const { ctx, theme: th } = this;
    const L = this.opts.labels;
    const text = `${L.historyError} · ${L.retry}`;
    ctx.font = this.font(0, "600", false);
    const w = ctx.measureText(text).width + 12;
    const left = align === "center" ? x - w / 2 : x;
    pill(ctx, text, left, y, { bg: th.background, fg: th.textStrong, font: this.font(0, "600", false), align: "left", border: ALERT_COLOR });
    this.hits.push({ x: left, y: y - 9, w, h: 18, run: () => this.retryHistory() });
  }

  /** Before the first candles arrive: placeholder candles across the chart, or the error with Retry. */
  private drawSkeleton(now: number): void {
    const { ctx, theme: th } = this;
    const pw = this.plotW(), mh = this.mainH();
    if (this.hist.state === "error") { this.errorPill(pw / 2, mh / 2, "center"); return; }
    // the price scale is 0–1 with no data: draw around its middle
    this.drawGhostCandles(0, pw * (1 - this.rightPad()), now, (this.priceMin + this.priceMax) / 2, (this.priceMax - this.priceMin) * 0.3, 17);
    ctx.font = this.font(1, "500", false);
    ctx.fillStyle = th.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.opts.labels.loading, pw / 2, mh - 24);
  }

  /** Diagonal stripes and a label over the plot while loading. */
  private drawLoading(): void {
    const { ctx, theme: th } = this;
    const pw = this.plotW(), ph = this.plotH();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
    ctx.fillStyle = withAlpha(th.background, 0.6);
    ctx.fillRect(0, 0, pw, ph);
    ctx.strokeStyle = withAlpha(th.text, 0.12);
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let x = -ph; x < pw; x += 24) { ctx.moveTo(x, ph); ctx.lineTo(x + ph, 0); }
    ctx.stroke();
    ctx.restore();
    pill(ctx, this.opts.labels.loading, pw / 2, ph / 2, { bg: th.background, fg: th.textStrong, font: this.font(2, "600", false), align: "center", border: th.axisLine });
  }

  private drawZones(): void {
    const { ctx } = this;
    for (const [ov, a] of this.drawnOverlays()) {
      if (ov.kind !== "zone" || a <= 0) continue;
      ctx.globalAlpha = a;
      const z = ov.o;
      const y1 = z.from === "top" ? 0 : this.priceToY(z.from);
      const y2 = z.to === "bottom" ? this.mainH() : this.priceToY(z.to);
      const x1 = z.start !== undefined ? this.timeToX(z.start) : 0;
      const x2 = z.end !== undefined ? this.timeToX(z.end) : this.plotW();
      ctx.fillStyle = z.color;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    ctx.globalAlpha = 1;
  }

  private drawOverlays(): void {
    const { ctx, theme: th } = this;
    const pw = this.plotW(), ph = this.mainH();
    const drawn = this.drawnOverlays();
    for (const [ov, a] of drawn) {
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (ov.kind === "priceLine") {
        const o = ov.o;
        const y = crisp(this.priceToY(o.price));
        const x1 = o.from !== undefined ? this.timeToX(o.from) : 0;
        const x2 = o.to !== undefined ? this.timeToX(o.to) : pw;
        ctx.strokeStyle = o.color ?? th.accent;
        ctx.lineWidth = o.width ?? 1;
        ctx.setLineDash(dash(o.style ?? "dashed"));
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.setLineDash([]);
      } else if (ov.kind === "alert") {
        const o = ov.o;
        const y = crisp(this.priceToY(o.price));
        ctx.strokeStyle = o.color ?? ALERT_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
        ctx.setLineDash([]);
      } else if (ov.kind === "timeLine") {
        const o = ov.o;
        const x = crisp(this.timeToX(o.time));
        if (x < -2 || x > pw + 2) continue;
        const color = o.color ?? th.textStrong;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash(dash(o.style ?? "solid"));
        ctx.beginPath(); ctx.moveTo(x, this.padTop() - 8); ctx.lineTo(x, ph); ctx.stroke();
        ctx.setLineDash([]);
        const parts = [o.label, o.countdown ? this.fmtCountdown(o.time - Date.now()) : ""].filter(Boolean).join("  ");
        if (parts) pill(ctx, parts, x, this.padTop() - 18, { bg: color, fg: th.background, font: this.font(0, "600"), align: "center", within: [4, pw - 4] });
      }
    }
    for (const [ov, a] of drawn) {
      if (ov.kind !== "marker" || a <= 0) continue;
      ctx.globalAlpha = a;
      const o = ov.o;
      // markers drop into place as they fade in
      const x = this.timeToX(o.time), y = this.priceToY(o.price) - (1 - a) * (o.side === "sell" ? -8 : 8);
      if (x < -40 || x > pw + 40) continue;
      const color = o.color ?? (o.side === "sell" ? th.down : o.side === "buy" ? th.up : th.accent);
      // a dot on the price, a stem, and a label with an arrow
      const up = o.side !== "sell";
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      const ly = up ? y + 22 : y - 22;
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, ly + (up ? -9 : 9)); ctx.stroke();
      const text = (o.side === "buy" ? "▲ " : o.side === "sell" ? "▼ " : "") + (o.text ?? "");
      pill(ctx, text.trim() || "•", x, ly, { bg: color, fg: th.overlayText, font: this.font(0, "600", false), align: "center" });
    }
    ctx.globalAlpha = 1;
  }

  private drawPriceLineLabels(dec: number): void {
    const { ctx, theme: th } = this;
    for (const [ov, a] of this.drawnOverlays()) {
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (ov.kind === "alert") {
        const o = ov.o, y = this.priceToY(o.price);
        if (y < 0 || y > this.mainH()) continue;
        const color = o.color ?? ALERT_COLOR;
        if (this.opts.priceScale.visible) pill(ctx, this.fmtPrice(o.price, dec), this.plotW() + 4, y, { bg: color, fg: th.background, font: this.font(0), align: "left", width: this.axisW - 8 });
        pill(ctx, o.label ?? this.opts.labels.alert, this.plotW() - 6, y - 11, { bg: color, fg: th.background, font: this.font(-1, "600", false), align: "right" });
        continue;
      }
      if (ov.kind !== "priceLine") continue;
      const o = ov.o;
      const y = this.priceToY(o.price);
      if (y < 0 || y > this.mainH()) continue;
      const color = o.color ?? th.accent;
      if (o.axisLabel !== false && this.opts.priceScale.visible) pill(ctx, this.fmtPrice(o.price, dec), this.plotW() + 4, y, { bg: color, fg: th.overlayText, font: this.font(0), align: "left", width: this.axisW - 8 });
      if (o.label) {
        const x = o.from !== undefined ? Math.max(6, this.timeToX(o.from) + 6) : 8;
        pill(ctx, o.label, x, y - 11, { bg: color, fg: th.overlayText, font: this.font(-1, "600", false), align: "left" });
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The live marker, price line and tag appear at the end of the intro. */
  private liveAlpha(now = performance.now()): number { return clamp01((this.introProgress(now) - 0.7) / 0.3); }

  private drawLivePoint(now: number): void {
    const { ctx } = this;
    const last = this.store.last;
    if (!last || !Number.isFinite(this.displayPrice)) return;
    const fade = this.liveAlpha(now);
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    try { this.drawLivePointInner(now, last); } finally { ctx.restore(); }
  }

  private drawLivePointInner(now: number, last: Candle): void {
    const { ctx, theme: th } = this;
    const y = this.priceToY(this.displayPrice);
    const lineType = this.opts.type === "line" || this.opts.type === "area";
    const x = lineType ? this.timeToX(this.liveTime()) : this.timeToX(last.time + this.tf.ms / 2);
    const color = th.accent;
    // price line
    const lp = this.opts.lastPrice;
    if (lp.line !== "none") {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      ctx.beginPath();
      ctx.moveTo(lp.line === "full" ? 0 : x, crisp(y));
      ctx.lineTo(this.plotW(), crisp(y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = this.liveAlpha(now);
    }
    // the marker at the live price
    if (this.isLive() && lp.marker !== "none") {
      if (typeof lp.marker === "function") {
        ctx.save();
        try { (lp.marker as LiveMarkerFn)(ctx, { x, y, color, now, live: true, animated: this.animated }); }
        catch (e) { console.error(e); }
        ctx.restore();
      } else drawMarker(ctx, lp.marker, x, y, color, this.animated ? now : NaN);
    }
    // time left in the candle
    if (this.isLive() && lp.countdown && this.tf.ms >= 2000) {
      const left = lp.countdownDirection === "up" ? Date.now() - last.time : this.store.endOf(last) - Date.now();
      if (left > 0) pill(ctx, this.fmtCountdown(left), x + (lineType ? 12 : Math.max(10, this.tf.ms / this.msPerPx / 2 + 6)), y - 14,
        { bg: withAlpha(th.background, 0.85), fg: th.textStrong, font: this.font(0), align: "left", border: th.axisLine });
    }
  }

  private drawLiveTag(dec: number): void {
    const { ctx, theme: th } = this;
    if (!this.store.last || !Number.isFinite(this.displayPrice) || !this.opts.lastPrice.tag || !this.opts.priceScale.visible) return;
    const fade = this.liveAlpha();
    if (fade <= 0) return;
    const y = Math.min(this.mainH() - 10, Math.max(10, this.priceToY(this.displayPrice)));
    const shown = this.store.last.close; // the tag shows the real last price; only the line glides
    const [head, tail] = splitEmphasis(this.fmtPrice(shown, dec), this.opts.lastPrice.emphasisDigits);
    const x = this.plotW() + 1, w = this.axisW - 2, h = 22;
    ctx.globalAlpha = fade;
    ctx.fillStyle = th.accent;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6, y - h / 2);
    roundedRightRect(ctx, x + 6, y - h / 2, w - 6, h, 4);
    ctx.lineTo(x + 6, y + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = th.accentText;
    ctx.font = this.font(0);
    const hw = ctx.measureText(head).width;
    ctx.font = this.font(2, "700");
    const tw = ctx.measureText(tail).width;
    const startX = x + 6 + Math.max(4, (w - 6 - hw - tw) / 2);
    ctx.font = this.font(0);
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillText(head, startX, y + 0.5);
    ctx.globalAlpha = fade;
    ctx.font = this.font(2, "700");
    ctx.fillText(tail, startX + hw, y + 0.5);
    ctx.globalAlpha = 1;
  }

  private drawCrosshair(dec: number): void {
    const p = this.pointer;
    const ch = this.opts.crosshair;
    if (!p && this.syncTime !== null && ch.mode !== "hidden") { this.drawSyncedCrosshair(); return; }
    if (!p || this.drag?.moved || ch.mode === "hidden") return;
    const { ctx, theme: th } = this;
    const pw = this.plotW(), ph = this.plotH();
    if (p.x < 0 || p.x > pw || p.y < 0 || p.y > ph) return;
    const t = this.xToTime(p.x);
    const c = this.store.candleAt(t);
    const snapX = c && ch.mode === "snap" ? this.timeToX(c.time + this.tf.ms / 2) : p.x;
    ctx.strokeStyle = th.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash(ch.style === "dashed" ? [4, 4] : dash(ch.style));
    ctx.beginPath();
    ctx.moveTo(crisp(snapX), 0); ctx.lineTo(crisp(snapX), ph);
    ctx.moveTo(0, crisp(p.y)); ctx.lineTo(pw, crisp(p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    if (!ch.labels) return;
    const box = this.layoutBoxes.find((b) => p.y >= b.top && p.y < b.top + b.h);
    const value = !box || box.key === null ? this.fmtPrice(this.yToPrice(p.y), dec) : this.paneValueLabel(box, p.y);
    if (this.opts.priceScale.visible) pill(ctx, value, pw + 4, p.y, { bg: th.pillBackground, fg: th.pillText, font: this.font(0), align: "left", width: this.axisW - 8 });
    const at = c && ch.mode === "snap" ? c.time : t;
    if (this.opts.timeScale.visible) pill(ctx, this.fmtTime(at, "crosshair"), snapX, ph + this.axisH() / 2, { bg: th.pillBackground, fg: th.pillText, font: this.font(0), align: "center" });
  }

  /** A vertical line at the time another (synced) chart is pointing at. */
  private drawSyncedCrosshair(): void {
    const { ctx, theme: th } = this;
    const t = this.syncTime!;
    const c = this.store.candleAt(t);
    const x = c && this.opts.crosshair.mode === "snap" ? this.timeToX(c.time + this.tf.ms / 2) : this.timeToX(t);
    if (x < 0 || x > this.plotW()) return;
    ctx.strokeStyle = th.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash(this.opts.crosshair.style === "dashed" ? "dashed" : this.opts.crosshair.style));
    ctx.beginPath(); ctx.moveTo(crisp(x), 0); ctx.lineTo(crisp(x), this.plotH()); ctx.stroke();
    ctx.setLineDash([]);
    if (this.opts.crosshair.labels && this.opts.timeScale.visible) {
      pill(ctx, this.fmtTime(c ? c.time : t, "crosshair"), x, this.plotH() + this.axisH() / 2, { bg: th.pillBackground, fg: th.pillText, font: this.font(0), align: "center" });
    }
  }

  /** Top-left: symbol, timeframe, and the hovered (or last) candle's values. */
  private drawLegend(dec: number): void {
    const { ctx, theme: th } = this;
    const lg = this.opts.legend, L = this.opts.labels;
    if (!lg.visible) return;
    const hovered = this.pointer && !this.drag?.moved && this.pointer.x <= this.plotW() ? this.store.candleAt(this.xToTime(this.pointer.x)) : null;
    const c = hovered ?? this.store.last;
    let x = 12;
    const y = 18;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (lg.symbol) {
      if (this.opts.symbol) {
        ctx.font = this.font(2, "600", false);
        ctx.fillStyle = th.textStrong;
        ctx.fillText(this.opts.symbol, x, y);
        x += ctx.measureText(this.opts.symbol).width + 8;
      }
      ctx.font = this.font(1, "", false);
      ctx.fillStyle = th.text;
      ctx.fillText(this.opts.timeframe, x, y);
      x += ctx.measureText(this.opts.timeframe).width + 14;
    }
    if (c && (lg.ohlc || lg.change)) {
      const close = hovered ? c.close : this.store.last!.close;
      const color = close >= c.open ? th.up : th.down;
      ctx.font = this.font(0);
      let room = true;
      if (lg.ohlc) for (const [k, v] of [[L.open, c.open], [L.high, c.high], [L.low, c.low], [L.close, close]] as const) {
        ctx.fillStyle = th.text;
        ctx.fillText(k, x, y);
        x += ctx.measureText(k).width + 4;
        ctx.fillStyle = color;
        const s = this.fmtPrice(v, dec);
        ctx.fillText(s, x, y);
        x += ctx.measureText(s).width + 10;
        if (x > this.plotW() - 60) { room = false; break; }
      }
      if (room && lg.change) {
        const chg = c.open ? ((close - c.open) / c.open) * 100 : 0;
        ctx.fillStyle = color;
        ctx.fillText(`${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%`, x, y);
      }
    }
    if (lg.indicators) this.drawMainIndicatorLegend(dec, hovered);
  }

  /** Second legend row: each price-pane indicator with its value and a close button. */
  private drawMainIndicatorLegend(dec: number, hovered: Candle | null): void {
    const { ctx, theme: th } = this;
    let x = 12;
    const y = 18 + this.opts.layout.fontSize + 7;
    const idx = hovered ? this.store.indexAtOrAfter(hovered.time) : this.store.length - 1;
    for (const [key, ind] of this.activeIndicators()) {
      if (ind.def.placement !== "main") continue;
      const { out, off } = this.output(ind);
      const at = Math.min(idx, off + (out.lines[0]?.values.length ?? 0) - 1) - off;
      ctx.font = this.font(0, "", false);
      ctx.fillStyle = out.lines[0]?.color ?? th.text;
      const label = ind.def.label(ind.params);
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 6;
      ctx.font = this.font(0);
      for (const line of out.lines) {
        const v = line.values[at];
        if (!Number.isFinite(v)) continue;
        const s = this.fmtPrice(v, dec);
        ctx.fillStyle = line.color;
        ctx.fillText(s, x, y);
        x += ctx.measureText(s).width + 6;
      }
      x = (this.opts.interaction.closeIndicators ? this.closeButton(x, y, () => { this.removeIndicator(key); this.emit("indicatorschange", this.indicatorList); }) : x) + 14;
      if (x > this.plotW() - 80) break;
    }
  }

  // ================================================================ indicators: drawing

  /**
   * An indicator's values. Short histories: computed once over every candle. Long ones (history.indicatorWindow):
   * computed for the candles around the view plus a warm-up, and again when the view moves past them.
   */
  private output(ind: ActiveIndicator): Win {
    const n = this.store.length, limit = this.opts.history.indicatorWindow;
    const c = ind.cache;
    if (!limit || n <= limit || ind.def.window === false) {
      if (!c || c.version !== this.dataVersion || c.off !== 0 || c.to !== n) ind.cache = { version: this.dataVersion, from: 0, to: n, off: 0, out: styled(ind.def.compute(this.store.all, ind.params), ind.style) };
      return ind.cache!;
    }
    const { from, to } = this.visibleCandles();
    if (c && c.version === this.dataVersion && from >= c.from && to <= c.to) return c;
    const span = Math.max(1, to - from);
    const lo = Math.max(0, from - span), hi = Math.min(n, to + span);
    const warm = Math.min(5000, 20 * Math.max(1, ...Object.values(ind.params).map((v) => (Number.isFinite(v) ? v : 1))) + 100);
    const off = Math.max(0, lo - warm);
    ind.cache = { version: this.dataVersion, from: lo, to: hi, off, out: styled(ind.def.compute(this.store.all.slice(off, hi), ind.params), ind.style) };
    return ind.cache;
  }

  /** Lines and bands of indicators drawn over the price (inside the price pane's clip). */
  private drawMainIndicators(): void {
    const { ctx } = this;
    const { from, to } = this.visibleCandles();
    const now = performance.now();
    const clipped = this.clipIntro(0, this.mainH(), now);
    for (const ind of this.indicators.values()) {
      if (ind.def.placement !== "main") continue;
      const fade = this.indFactor(ind, now);
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      const { out, off } = this.output(ind);
      if (out.band) {
        const up = out.lines[out.band.upper].values, lo = out.lines[out.band.lower].values;
        ctx.beginPath();
        let started = false;
        for (let i = from; i < to; i++) if (Number.isFinite(up[i - off])) { const x = this.candleX(i), y = this.priceToY(up[i - off]); if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; } }
        for (let i = to - 1; i >= from; i--) if (Number.isFinite(lo[i - off])) ctx.lineTo(this.candleX(i), this.priceToY(lo[i - off]));
        ctx.closePath();
        ctx.fillStyle = out.band.color;
        if (started) ctx.fill();
      }
      for (const line of out.lines) this.strokeLine(line.values, from, to, line.color, line.width ?? 1.5, (v) => this.priceToY(v), off);
    }
    ctx.globalAlpha = 1;
    if (clipped) ctx.restore();
  }

  private candleX(i: number): number { return this.timeToX(this.store.at(i).time + this.tf.ms / 2); }

  private strokeLine(values: ArrayLike<number>, from: number, to: number, color: string, width: number, y: (v: number) => number, off = 0): void {
    const { ctx } = this;
    ctx.beginPath();
    let pen = false;
    for (let i = from; i < to; i++) {
      const v = values[i - off];
      if (!Number.isFinite(v)) { pen = false; continue; }
      const x = this.candleX(i), yy = y(v);
      if (pen) ctx.lineTo(x, yy); else { ctx.moveTo(x, yy); pen = true; }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  /** Indicator panes below the price: divider, levels, histogram, lines, own axis labels, and a header. */
  private drawPanes(): void {
    const { ctx, theme: th } = this;
    const pw = this.plotW();
    const { from, to } = this.visibleCandles();
    const candlePx = this.tf.ms / this.msPerPx;
    const barW = Math.max(1, Math.min(candlePx * this.opts.series.candleWidth, candlePx - 1));
    const hovered = this.pointer && !this.drag?.moved && this.pointer.x <= pw ? this.store.candleAt(this.xToTime(this.pointer.x)) : null;
    const idx = hovered ? this.store.indexAtOrAfter(hovered.time) : this.store.length - 1;
    const now = performance.now();

    for (const box of this.layoutBoxes.slice(1)) {
      const ind = this.indicators.get(box.key!);
      if (!ind || box.h < 2) continue;
      const open = this.indFactor(ind, now);
      // opening or closing: fade, and keep everything inside the pane as it grows or shrinks
      if (open < 1) { ctx.save(); ctx.globalAlpha = open; ctx.beginPath(); ctx.rect(0, box.top, this.w, box.h); ctx.clip(); }
      const { out, off } = this.output(ind);
      const at = Math.min(idx, off + (out.lines[0]?.values.length ?? out.histogram?.values.length ?? 0) - 1) - off;
      // scale: fixed range, or fit the visible values (histograms include zero)
      let lo = Infinity, hi = -Infinity;
      if (out.range) [lo, hi] = out.range;
      else {
        const scan = (vals: ArrayLike<number>) => { for (let i = from; i < to; i++) { const v = vals[i - off]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } };
        out.lines.forEach((l) => scan(l.values));
        if (out.histogram) { scan(out.histogram.values); lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
        if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
        const pad = (hi - lo) * 0.1;
        if (!out.histogram || lo < 0) lo -= pad;
        hi += pad;
      }
      box.min = lo; box.max = hi;
      const y = (v: number) => this.paneY(box, v);

      // divider and the right axis line
      ctx.strokeStyle = th.axisLine;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, crisp(box.top)); ctx.lineTo(this.w, crisp(box.top)); ctx.stroke();

      ctx.save();
      ctx.beginPath(); ctx.rect(0, box.top + 1, Math.min(pw, this.introProgress(now) < 1 ? clamp01(this.ease(this.introProgress(now))) * (pw + 2) : pw), box.h - 1); ctx.clip();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = th.levelLine;
      for (const lvl of out.levels ?? []) { const ly = crisp(y(lvl)); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(pw, ly); ctx.stroke(); }
      ctx.setLineDash([]);
      if (out.histogram) {
        const h = out.histogram, zero = y(Math.max(lo, Math.min(hi, 0)));
        for (const upPass of [1, 0]) {
          ctx.fillStyle = upPass ? h.upColor : h.downColor;
          for (let i = from; i < to; i++) {
            const v = h.values[i - off];
            if (!Number.isFinite(v) || h.up[i - off] !== upPass) continue;
            const x = this.candleX(i), yv = y(v);
            ctx.fillRect(Math.round(x - barW / 2), Math.min(zero, yv), Math.max(1, Math.round(barW)), Math.max(1, Math.abs(zero - yv)));
          }
        }
      }
      for (const line of out.lines) this.strokeLine(line.values, from, to, line.color, line.width ?? 1.5, y, off);
      ctx.restore();

      // axis labels
      ctx.font = this.font(-1);
      ctx.fillStyle = th.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const ticks = out.range ? (out.levels ?? []) : priceTicks(lo, hi, Math.max(1, Math.floor(box.h / 40)));
      const step = ticks.length > 1 ? ticks[1] - ticks[0] : hi - lo;
      if (this.opts.priceScale.visible) for (const t of ticks) {
        const ty = y(t);
        if (ty < box.top + 8 || ty > box.top + box.h - 6) continue;
        ctx.fillText(this.formatPaneValue(t, step), pw + 10, ty);
      }

      // header: name, values at the hovered (or last) candle, close button
      let x = 10;
      const hy = box.top + 12;
      ctx.font = this.font(0, "", false);
      ctx.fillStyle = th.textStrong;
      const label = ind.def.label(ind.params);
      ctx.fillText(label, x, hy);
      x += ctx.measureText(label).width + 8;
      ctx.font = this.font(0);
      const vals: [string, number][] = out.lines.map((l) => [l.color, l.values[at]]);
      if (out.histogram) vals.push([out.histogram.up[at] ? out.histogram.upColor : out.histogram.downColor, out.histogram.values[at]]);
      for (const [color, v] of vals) {
        if (!Number.isFinite(v)) continue;
        const s = this.formatPaneValue(v, step / 100);
        ctx.fillStyle = color.startsWith("rgba") ? color.replace(/[\d.]+\)$/, "1)") : color;
        ctx.fillText(s, x, hy);
        x += ctx.measureText(s).width + 8;
      }
      const key = box.key!;
      if (this.opts.interaction.closeIndicators && !ind.removing) this.closeButton(x, hy, () => { this.removeIndicator(key); this.emit("indicatorschange", this.indicatorList); });
      if (open < 1) ctx.restore();
    }
  }

  private paneY(box: PaneBox, v: number): number {
    const top = box.top + 22, bottom = box.top + box.h - 6;
    const lo = box.min ?? 0, hi = box.max ?? 1;
    return bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);
  }

  private paneValueLabel(box: PaneBox, y: number): string {
    const top = box.top + 22, bottom = box.top + box.h - 6;
    const lo = box.min ?? 0, hi = box.max ?? 1;
    const v = lo + ((bottom - y) / (bottom - top)) * (hi - lo);
    return this.formatPaneValue(v, (hi - lo) / 100);
  }

  /** Compact numbers for panes: 54.2, 0.00031, 1.2K, 3.4M. */
  private formatPaneValue(v: number, step: number): string {
    if (this.opts.format.indicator) return this.opts.format.indicator(v);
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(1) + "K";
    return this.fmtPrice(v, Math.min(8, stepDecimals(Math.abs(step) || 1)));
  }

  /** A small × drawn at (x, y); registers a hit area. Returns the x after it. */
  private closeButton(x: number, y: number, run: () => void): number {
    const { ctx, theme: th } = this;
    const s = 14;
    ctx.strokeStyle = th.text;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 3); ctx.lineTo(x + 10, y + 3);
    ctx.moveTo(x + 10, y - 3); ctx.lineTo(x + 4, y + 3);
    ctx.stroke();
    this.hits.push({ x, y: y - s / 2, w: s, h: s, run });
    return x + s;
  }

  private hitAt(p: { x: number; y: number }): Hit | undefined {
    // generous margins so the small buttons are easy to hit with a finger
    return this.hits.find((h) => p.x >= h.x - 6 && p.x <= h.x + h.w + 6 && p.y >= h.y - 6 && p.y <= h.y + h.h + 6);
  }

  /** Index of the pane whose top divider is under the pointer (0 = none). */
  private dividerAt(p: { x: number; y: number }): number {
    if (p.x > this.plotW() || !this.opts.interaction.resizePanes) return 0;
    for (let i = 1; i < this.layoutBoxes.length; i++) if (Math.abs(p.y - this.layoutBoxes[i].top) <= 4) return i;
    return 0;
  }

  private resizePanes(y: number): void {
    const d = this.paneDrag!;
    const dy = y - d.y;
    const minPane = this.opts.layout.paneMinHeight;
    const minAbove = d.index === 1 ? 120 : minPane;
    const above = Math.max(minAbove, d.above + dy), below = Math.max(minPane, d.above + d.below - above);
    const ph = this.plotH();
    const belowKey = this.layoutBoxes[d.index].key!, aboveKey = this.layoutBoxes[d.index - 1].key;
    this.indicators.get(belowKey)!.frac = below / ph;
    if (aboveKey) this.indicators.get(aboveKey)!.frac = above / ph;
    this.markDirty();
  }

  // ================================================================ drawings: placing, hit testing, drawing

  private toPoint(p: { x: number; y: number }): DrawingPoint { return { time: this.xToTime(p.x), price: this.yToPrice(p.y) }; }
  private toXY(q: DrawingPoint): { x: number; y: number } { return { x: this.timeToX(q.time), y: this.priceToY(q.price) }; }

  private placePoint(p: { x: number; y: number }): void {
    const pl = this.placing!;
    pl.points.push(this.toPoint(p));
    if (pl.points.length >= POINTS_NEEDED[pl.tool]) {
      const id = "dr" + this.nextId++;
      const d: Drawing = { id, tool: pl.tool, points: pl.points, color: this.drawingColor, width: this.opts.drawings.width, style: this.opts.drawings.style };
      this.drawingList.push(d);
      this.tool = null;
      this.placing = null;
      this.emit("toolchange", null);
      this.drawingsChanged();
      this.select(id);
      this.emit("drawingcreate", { ...d, points: d.points.map((q) => ({ ...q })) });
    }
    this.markDirty();
  }

  private fibYs(d: Drawing): number[] {
    return d.tool === "fib" ? this.opts.drawings.fibLevels.map((l) => this.priceToY(fibPrice(d.points[0], d.points[1], l))) : [];
  }

  /** The drawing under the pointer, and which handle (or -1 for the body). Topmost first. */
  private drawingAt(p: { x: number; y: number }): { id: string; handle: number } | null {
    for (let i = this.drawingList.length - 1; i >= 0; i--) {
      const d = this.drawingList[i];
      const pts = d.points.map((q) => this.toXY(q));
      if (d.id === this.selectedId && !d.hidden) {
        const h = pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 8);
        if (h >= 0) return { id: d.id, handle: h };
      }
      if (d.hidden) continue;
      if (d.tool === "text") {
        const b = this.textBoxes.get(d.id);
        if (b && p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) return { id: d.id, handle: -1 };
        continue;
      }
      if (distToDrawing(d.tool, pts, p, this.plotW(), this.mainH(), this.fibYs(d)) <= 6) return { id: d.id, handle: -1 };
    }
    return null;
  }

  private moveDrawing(p: { x: number; y: number }): void {
    const dd = this.drawDrag!;
    const d = this.drawingList.find((x) => x.id === dd.id);
    if (!d) return;
    if (Math.hypot(p.x - dd.start.x, p.y - dd.start.y) > 2) dd.moved = true;
    const dt = (p.x - dd.start.x) * this.msPerPx;
    const dp = this.yToPrice(p.y) - this.yToPrice(dd.start.y);
    d.points = dd.orig.map((q, i) => (dd.handle === -1 || dd.handle === i ? { time: q.time + dt, price: q.price + dp } : { ...q }));
    this.markDirty();
  }

  private drawDrawings(dec: number): void {
    const { ctx, theme: th } = this;
    const pw = this.plotW(), mh = this.mainH();
    const list: Drawing[] = [...this.drawingList];
    if (this.placing && this.placing.points.length && this.placing.hover) {
      list.push({ id: "_preview", tool: this.placing.tool, points: [...this.placing.points, this.placing.hover], color: this.drawingColor, width: this.opts.drawings.width, style: "dashed" });
    }
    for (const d of list) {
      if (d.hidden) continue;
      const pts = d.points.map((q) => this.toXY(q));
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.width ?? 1.5;
      ctx.setLineDash(dash(d.style ?? "solid"));
      ctx.beginPath();
      switch (d.tool) {
        case "line": ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); break;
        case "arrow":
          ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          arrowHead(ctx, pts[0], pts[1], 7 + (d.width ?? 1.5) * 2, d.color);
          ctx.beginPath();
          break;
        case "circle": {
          const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          ctx.fillStyle = withAlpha(d.color, 0.08);
          ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "text": {
          const size = d.fontSize ?? this.opts.layout.fontSize + 3;
          const text = d.text || this.opts.labels.textPlaceholder;
          const box = drawText(ctx, text, pts[0].x, pts[0].y, { font: `600 ${size}px ${th.font}`, color: d.color, align: "left", baseline: "middle", faded: !d.text });
          this.textBoxes.set(d.id, box);
          if (d.id === this.selectedId) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = withAlpha(d.color, 0.7);
            ctx.lineWidth = 1;
            ctx.strokeRect(box.x - 3, box.y - 2, box.w + 6, box.h + 4);
          }
          ctx.beginPath();
          break;
        }
        case "trend": { const e = rayEnd(pts[0], pts[1], pw, mh); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(e.x, e.y); break; }
        case "horizontal": ctx.moveTo(0, crisp(pts[0].y)); ctx.lineTo(pw, crisp(pts[0].y)); break;
        case "vertical": ctx.moveTo(crisp(pts[0].x), 0); ctx.lineTo(crisp(pts[0].x), mh); break;
        case "rect": {
          const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
          const w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y);
          ctx.fillStyle = withAlpha(d.color, 0.1);
          ctx.fillRect(x, y, w, h);
          ctx.rect(crisp(x), crisp(y), Math.round(w), Math.round(h));
          break;
        }
        case "measure": {
          const a = d.points[0], b = d.points[1];
          const color = b.price >= a.price ? th.up : th.down;
          const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
          const w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y);
          ctx.fillStyle = withAlpha(color, 0.12);
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = color;
          ctx.setLineDash([]);
          // arrows along the move
          const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
          ctx.moveTo(mx, pts[0].y); ctx.lineTo(mx, pts[1].y);
          ctx.moveTo(pts[0].x, my); ctx.lineTo(pts[1].x, my);
          ctx.stroke();
          ctx.beginPath();
          const diff = b.price - a.price, pct = a.price ? (diff / a.price) * 100 : 0;
          const bars = Math.round(Math.abs(b.time - a.time) / this.tf.ms);
          const sign = diff >= 0 ? "+" : "−";
          const text = `${sign}${this.fmtPrice(Math.abs(diff), dec)} (${sign}${Math.abs(pct).toFixed(2)}%) · ${bars} · ${formatDuration(Math.abs(b.time - a.time))}`;
          const below = pts[1].y >= pts[0].y;
          pill(ctx, text, mx, below ? y + h + 14 : y - 14, { bg: color, fg: th.overlayText, font: this.font(0), align: "center", within: [4, pw - 4] });
          break;
        }
        case "fib": {
          const left = Math.min(pts[0].x, pts[1].x);
          ctx.setLineDash([3, 4]);
          ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
          ctx.stroke();
          ctx.setLineDash([]);
          const levels = this.opts.drawings.fibLevels;
          const ys = levels.map((l) => this.priceToY(fibPrice(d.points[0], d.points[1], l)));
          // soft fill between 38.2 % and 61.8 % (when those levels are in use)
          const a = levels.indexOf(0.382), b = levels.indexOf(0.618);
          if (a >= 0 && b >= 0) {
            ctx.fillStyle = withAlpha(d.color, 0.07);
            ctx.fillRect(left, Math.min(ys[a], ys[b]), pw - left, Math.abs(ys[b] - ys[a]));
          }
          ctx.beginPath();
          ys.forEach((y) => { ctx.moveTo(left, crisp(y)); ctx.lineTo(pw, crisp(y)); });
          ctx.stroke();
          ctx.font = this.font(-1);
          ctx.fillStyle = d.color;
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          levels.forEach((l, i) => ctx.fillText(`${(l * 100).toFixed(1)}%  ${this.fmtPrice(fibPrice(d.points[0], d.points[1], l), dec)}`, left + 4, ys[i] - 2));
          ctx.beginPath();
          break;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // handles on the selected drawing (and on the points placed so far)
      if (d.id === this.selectedId || d.id === "_preview") {
        for (const q of pts) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = th.background;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = d.color;
          ctx.stroke();
        }
      }
    }
  }

  /** Price tags for horizontal lines, and price/time tags for the selected drawing's points. */
  private drawDrawingTags(dec: number): void {
    const { ctx } = this;
    const tag = (text: string, x: number, y: number, color: string, align: "left" | "center") =>
      pill(ctx, text, x, y, { bg: color, fg: this.theme.overlayText, font: this.font(0), align, width: align === "left" ? this.axisW - 8 : 0 });
    for (const d of this.drawingList) {
      if (d.hidden) continue;
      const sel = d.id === this.selectedId;
      if (d.tool === "horizontal" || (sel && d.tool !== "text")) {
        for (const q of d.tool === "vertical" ? [] : d.points) {
          const y = this.priceToY(q.price);
          if (y > 0 && y < this.mainH() && this.opts.priceScale.visible) tag(this.fmtPrice(q.price, dec), this.plotW() + 4, y, d.color, "left");
        }
      }
      if (sel && d.tool !== "horizontal" && d.tool !== "text") {
        for (const q of d.points) {
          const x = this.timeToX(q.time);
          if (x > 0 && x < this.plotW() && this.opts.timeScale.visible) tag(this.fmtTime(q.time, "drawing"), x, this.plotH() + this.axisH() / 2, d.color, "center");
        }
      }
    }
  }

  // ================================================================ input

  private local(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    // shown turned a quarter clockwise: the chart's x runs down the screen and its y runs right to left
    if (this.rotation === 90) return { x: e.clientY - r.top, y: r.right - e.clientX };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private crosshairInfo(x: number, y: number): CrosshairInfo {
    const time = this.xToTime(x);
    return { time, price: this.yToPrice(y), candle: this.store.candleAt(time) };
  }

  private bindInput(): void {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => c.removeEventListener(type, fn as EventListener, opts));
    };

    on("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.canvas.focus({ preventScroll: true });
      const p = this.local(e);
      this.touches.set(e.pointerId, p);
      c.setPointerCapture?.(e.pointerId);
      this.viewAnim = null; // a touch takes over from any zoom or scroll animation
      if (this.touches.size === 2 && this.opts.interaction.pinchZoom) {
        this.axisDrag = null;
        const [a, b] = [...this.touches.values()];
        const mid = (a.x + b.x) / 2;
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), msPerPx: this.msPerPx, anchorTime: this.xToTime(mid), anchorX: mid };
        this.drag = null;
        return;
      }
      const divider = this.dividerAt(p);
      if (divider > 0) {
        const above = this.layoutBoxes[divider - 1], below = this.layoutBoxes[divider];
        this.paneDrag = { index: divider, y: p.y, above: above.h, below: below.h };
        return;
      }
      if (this.hitAt(p)) return;
      // drag the price axis to stretch prices, the time axis to zoom
      if (this.opts.interaction.axisScale && this.touches.size === 1 && !this.placing) {
        if (p.x > this.plotW() && p.y < this.mainH() && this.opts.priceScale.visible) { this.axisDrag = { kind: "price", y: p.y, min: this.priceMin, max: this.priceMax }; return; }
        if (p.y > this.plotH() && p.x <= this.plotW() && this.opts.timeScale.visible) { this.axisDrag = { kind: "time", x: p.x, ms: this.msPerPx }; return; }
      }
      if (p.x <= this.plotW() && p.y < this.mainH()) {
        if (this.placing) { this.placePoint(p); return; }
        const found = this.opts.interaction.editDrawings ? this.drawingAt(p) : null;
        if (found) {
          this.select(found.id);
          const d = this.selectedDrawing!;
          if (!d.locked) this.drawDrag = { id: d.id, handle: found.handle, start: p, orig: d.points.map((q) => ({ ...q })), moved: false };
          this.markDirty();
          return;
        }
        if (this.selectedId) this.select(null);
      }
      if (p.x <= this.plotW() && this.touches.size === 1) this.drag = { x: p.x, y: p.y, rightTime: this.rightTime, min: this.priceMin, max: this.priceMax, moved: false, id: e.pointerId };
      this.pointer = e.pointerType === "mouse" ? p : null;
      this.markDirty();
    });

    on("pointermove", (e) => {
      const p = this.local(e);
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, p);
      if (this.pinch && this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const next = Math.min(this.maxMsPerPx(), Math.max(this.minMsPerPx(), this.pinch.msPerPx * (this.pinch.dist / dist)));
        this.msPerPx = next;
        const mid = (a.x + b.x) / 2;
        this.setFollowing(false);
        this.rightTime = this.pinch.anchorTime + (this.plotW() - mid) * next;
        this.markDirty();
        return;
      }
      if (this.paneDrag) {
        this.resizePanes(p.y);
        return;
      }
      if (this.axisDrag) {
        const d = this.axisDrag;
        if (d.kind === "price") {
          // down squeezes the prices together, up spreads them out
          const f = Math.exp((p.y - d.y) * 0.005), mid = (d.min + d.max) / 2, half = ((d.max - d.min) / 2) * f;
          this.priceMin = mid - half; this.priceMax = mid + half;
          this.manualScale = true;
        } else {
          // right zooms in, left zooms out; the right edge (or the live candle) stays put
          const ms = this.clampMs(d.ms * Math.exp(-(p.x - d.x) * 0.005));
          if (!this.following) this.rightTime = this.xToTime(this.plotW());
          this.msPerPx = ms;
        }
        this.markDirty();
        return;
      }
      if (this.drawDrag) { this.moveDrawing(p); return; }
      if (this.placing) { this.placing.hover = this.toPoint(p); this.pointer = p; this.markDirty(); }
      if (!this.drag) c.style.cursor = this.dividerAt(p) > 0 ? "row-resize" : this.hitAt(p) ? "pointer"
        : this.opts.interaction.axisScale && p.x > this.plotW() && p.y < this.mainH() ? "ns-resize"
        : this.opts.interaction.axisScale && p.y > this.plotH() && p.x <= this.plotW() ? "ew-resize"
        : !this.placing && this.opts.interaction.editDrawings && this.drawingAt(p) ? "move" : "crosshair";
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
        if (Math.abs(dx) > 3 || (this.manualScale && Math.abs(dy) > 3)) this.drag.moved = true;
        if (this.drag.moved && this.opts.interaction.pan) {
          if (Math.abs(dx) > 0.5 || !this.manualScale) {
            this.setFollowing(false);
            this.rightTime = this.drag.rightTime - dx * this.msPerPx;
          }
          // with a price range set by hand, dragging up and down moves through prices too
          if (this.manualScale) {
            const per = (this.drag.max - this.drag.min) / Math.max(1, this.mainH() - this.opts.layout.paddingBottom - this.padTop());
            this.priceMin = this.drag.min + dy * per; this.priceMax = this.drag.max + dy * per;
          }
          c.style.cursor = "grabbing";
        }
      }
      if (e.pointerType === "mouse" || this.drag?.moved === false) this.pointer = p;
      this.emitCrosshair();
      this.markDirty();
    });

    const end = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.axisDrag) { this.axisDrag = null; this.markDirty(); return; }
      if (this.paneDrag) { this.paneDrag = null; c.style.cursor = "crosshair"; this.markDirty(); return; }
      if (this.drawDrag) { const moved = this.drawDrag.moved; this.drawDrag = null; if (moved) this.drawingsChanged(); return; }
      const hit = this.drag?.moved ? null : this.hitAt(this.local(e));
      if (hit) { this.drag = null; hit.run(); this.markDirty(); return; }
      if (this.touches.size < 2) this.pinch = null;
      if (this.drag && this.drag.id === e.pointerId) {
        if (!this.drag.moved) {
          const p = this.local(e);
          this.emit("click", this.crosshairInfo(p.x, p.y));
          if (e.pointerType !== "mouse") this.pointer = this.pointer ? null : p; // tap toggles the crosshair on touch
        }
        // snap back to following when dragged to (or past) the live edge
        if (this.drag.moved && this.rightTime >= this.liveRight()) this.setFollowing(true);
        this.drag = null;
      }
      c.style.cursor = "crosshair";
      this.markDirty();
    };
    on("pointerup", end);
    on("pointercancel", end);
    on("pointerleave", (e) => {
      if (e.pointerType === "mouse") { this.pointer = null; this.emit("crosshair", null); this.markDirty(); }
    });

    on("wheel", (e) => {
      // with wheel zoom off, the page scrolls as usual
      if (!this.opts.interaction.wheelZoom) return;
      e.preventDefault();
      const p = this.local(e);
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
        // horizontal trackpad scroll pans
        this.viewAnim = null;
        this.setFollowing(false);
        this.rightTime += e.deltaX * this.msPerPx;
        this.markDirty();
        return;
      }
      // a mouse wheel moves in big steps: animate them; a trackpad sends many small ones: follow directly
      const lines = e.deltaMode === 1, delta = lines ? e.deltaY * 40 : e.deltaY;
      const trackpad = !lines && (e.ctrlKey || Math.abs(delta) < 40);
      const factor = Math.exp(delta * (e.ctrlKey ? 0.01 : 0.0015));
      this.zoomAt(this.following ? this.timeToX(this.liveTime()) : p.x, factor, { animate: !trackpad });
    }, { passive: false });

    on("dblclick", (e) => {
      const p = this.local(e);
      if (this.opts.interaction.axisScale) {
        if (p.x > this.plotW() && p.y < this.mainH()) { this.setPriceRange(null); return; }
        if (p.y > this.plotH() && p.x <= this.plotW()) { this.resetZoom(); return; }
      }
      if (this.opts.interaction.editDrawings && this.drawingAt(p)) return;
      if (this.opts.interaction.doubleClickToLive) this.goLive();
    });

    on("keydown", (e) => {
      if (!this.opts.interaction.keyboard) return;
      const step = this.plotW() * 0.15 * this.msPerPx;
      // keep stepping from where a running scroll is heading
      const from = this.viewAnim && typeof this.viewAnim.toRight === "number" ? this.viewAnim.toRight : this.rightTime;
      const ms = this.viewAnim?.toMs ?? this.msPerPx;
      let handled = true;
      switch (e.key) {
        case "ArrowLeft": if (!this.opts.interaction.pan) { handled = false; break; } this.setFollowing(false); this.tweenView(ms, { right: from - step }, this.dur("zoom")); break;
        case "ArrowRight":
          if (!this.opts.interaction.pan) { handled = false; break; }
          if (this.following || from + step >= this.liveRight()) this.goLive();
          else this.tweenView(ms, { right: from + step }, this.dur("zoom"));
          break;
        case "+": case "=": this.zoomIn(); break;
        case "-": case "_": this.zoomOut(); break;
        case "End": this.goLive(); break;
        case "Home": this.fitContent(); break;
        case "Escape":
          if (this.placing || this.tool) this.setDrawingTool(null);
          else if (this.selectedId) this.select(null);
          else handled = false;
          break;
        case "Delete": case "Backspace":
          if (this.selectedId && this.opts.interaction.editDrawings && !this.selectedDrawing?.locked) this.removeDrawing(this.selectedId); else handled = false;
          break;
        default: handled = false;
      }
      if (handled) { e.preventDefault(); this.markDirty(); }
    });
  }

  private emitCrosshair(): void {
    if (!this.pointer) return;
    this.emit("crosshair", this.crosshairInfo(this.pointer.x, this.pointer.y));
  }
}

// ================================================================ drawing helpers

function crisp(v: number): number { return Math.round(v) + 0.5; }

/** A steady pseudo-random number in 0–1 for an integer (for placeholder candles). */
function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const ALERT_COLOR = "#f5a524";

/** The built-in live-price markers. `now` is NaN when animation is off. */
function drawMarker(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, color: string, now: number): void {
  const still = !Number.isFinite(now);
  const dot = (r = 3) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const halo = (r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  switch (kind) {
    case "ripple": {
      // rings spreading out and fading, one after another
      const period = 1800;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const t = still ? i / 3 + 0.15 : ((now / period + i / 3) % 1);
        ctx.strokeStyle = withAlpha(color, 0.6 * (1 - t));
        ctx.beginPath(); ctx.arc(x, y, 4 + t * 22, 0, Math.PI * 2); ctx.stroke();
      }
      dot(3.5);
      break;
    }
    case "radar": {
      // a sweep turning around the point, with a ring
      const r = 20;
      const a = still ? -Math.PI / 2 : ((now / 1400) % 1) * Math.PI * 2;
      for (let i = 0; i < 18; i++) {
        const a0 = a - (i + 1) * 0.07, a1 = a - i * 0.07;
        ctx.fillStyle = withAlpha(color, 0.32 * (1 - i / 18));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a1); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = withAlpha(color, 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = withAlpha(color, 0.9);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke();
      dot(3);
      break;
    }
    case "glow":
      halo(18, 0.45);
      halo(8, 0.6);
      dot(3);
      break;
    case "dot":
      dot(3.5);
      break;
    default: {
      // pulse
      const pulse = still ? 0.5 : (Math.sin(now / 420) + 1) / 2;
      halo(10 + pulse * 6, 0.55);
      dot(3);
    }
  }
}

/** An arrow head at `to`, pointing away from `from`. */
function arrowHead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number, color: string): void {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(a - 0.45), to.y - size * Math.sin(a - 0.45));
  ctx.lineTo(to.x - size * Math.cos(a + 0.45), to.y - size * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

/** Text with an optional tag behind it. Returns the box it takes up. */
function drawText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  o: { font: string; color: string; background?: string; align: "left" | "center" | "right"; baseline: "top" | "middle" | "bottom"; faded?: boolean },
): { x: number; y: number; w: number; h: number } {
  ctx.font = o.font;
  const lines = text.split("\n");
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(o.font)?.[1] ?? "12");
  const lh = Math.round(size * 1.3);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const h = lh * lines.length;
  const pad = o.background ? 6 : 0;
  const left = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  const top = o.baseline === "top" ? y : o.baseline === "bottom" ? y - h : y - h / 2;
  if (o.background) {
    ctx.fillStyle = o.background;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(left - pad, top - pad / 2, w + pad * 2, h + pad, 5); else ctx.rect(left - pad, top - pad / 2, w + pad * 2, h + pad);
    ctx.fill();
  }
  ctx.fillStyle = o.color;
  ctx.globalAlpha *= o.faded ? 0.55 : 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, left, top + lh * i + lh / 2));
  if (o.faded) ctx.globalAlpha /= 0.55;
  return { x: left - pad, y: top - pad / 2, w: w + pad * 2, h: h + pad };
}

/** "45s", "12m", "3h 20m", "2d 4h". */
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Applies per-indicator style overrides to computed output. */
function styled(out: IndicatorOutput, st: IndicatorStyle): IndicatorOutput {
  if (!st.colors && st.width === undefined && !st.upColor && !st.downColor && !st.bandColor && !st.levels) return out;
  return {
    ...out,
    lines: out.lines.map((l, i) => ({ ...l, color: st.colors?.[i] ?? l.color, width: st.width ?? l.width })),
    histogram: out.histogram && { ...out.histogram, upColor: st.upColor ?? out.histogram.upColor, downColor: st.downColor ?? out.histogram.downColor },
    band: out.band && { ...out.band, color: st.bandColor ?? out.band.color },
    levels: st.levels ?? out.levels,
  };
}

function dash(style: LineStyle): number[] {
  return style === "dashed" ? [6, 4] : style === "dotted" ? [1, 3] : [];
}

function withAlpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const r = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (r) {
    const [cr, cg, cb] = r[1].split(",").map((s) => s.trim());
    return `rgba(${cr}, ${cg}, ${cb}, ${a})`;
  }
  return color;
}

function roundedRightRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
}

function pill(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  o: { bg: string; fg: string; font: string; align: "left" | "center" | "right"; width?: number; border?: string; within?: [number, number] },
): void {
  ctx.font = o.font;
  const tw = ctx.measureText(text).width;
  const w = Math.max(o.width ?? 0, tw + 12), h = 18;
  let left = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  // keep the label inside the given span (e.g. the plot) instead of letting it be cut off
  if (o.within) left = Math.min(Math.max(left, o.within[0]), o.within[1] - w);
  ctx.fillStyle = o.bg;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(left, y - h / 2, w, h, 4); else ctx.rect(left, y - h / 2, w, h);
  ctx.fill();
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = o.fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, left + w / 2, y + 0.5);
}
