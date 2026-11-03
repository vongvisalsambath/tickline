// The chart engine: one canvas, a view (time per pixel + right edge), a render loop, and pointer/keyboard input.
// Framework-free; <trade-chart> (element.ts) wraps it. Everything is drawn in CSS pixels on a HiDPI canvas.
import type {
  Candle, ChartType, CrosshairInfo, MarkerOptions, PriceLineOptions, Theme, Tick, TimeLineOptions, Timeframe,
  VisibleRange, ZoneOptions,
} from "./types";
import { CandleStore, heikinAshi } from "./data";
import { autoPrecision, formatPrice, priceTicks, splitEmphasis, stepDecimals, niceStep } from "./price";
import { formatCountdown, formatTime, parseTimeframe, timeTicks, type ParsedTimeframe, MS } from "./time";
import { DARK, LIGHT } from "./theme";
import { getIndicator, resolveParams, type IndicatorDefinition, type IndicatorOutput } from "./indicators";

export interface ChartOptions {
  type?: ChartType;
  timeframe?: Timeframe;
  theme?: "dark" | "light" | Theme;
  /** Decimals for prices, or "auto" from the data. */
  precision?: number | "auto";
  /** Shown in the legend, e.g. "BTC/USDT". */
  symbol?: string;
  /** Frame-rate cap while animating (default 60). */
  fps?: number;
  /** "local" (default) or a fixed offset from UTC in minutes, e.g. 420 for UTC+7. */
  timezone?: "local" | number;
  /** Show the time left in the current candle next to the live price (default true). */
  countdown?: boolean;
  /** Live price line across the whole chart, or only from the last candle to the axis (default "short"). */
  priceLine?: "full" | "short" | "none";
  /** Empty space to the right of the live candle, as a share of the width (default 0.2). */
  rightPadding?: number;
  /** Fewest candles you can zoom in to (default 12). */
  minVisibleCandles?: number;
  /** How many trailing digits of the live price are drawn large (default 3). */
  emphasisDigits?: number;
  /** Smooth gliding of the live price between ticks (default true; off with reduced motion). */
  animate?: boolean;
}

type Overlay =
  | { kind: "marker"; o: MarkerOptions }
  | { kind: "priceLine"; o: PriceLineOptions }
  | { kind: "timeLine"; o: TimeLineOptions }
  | { kind: "zone"; o: ZoneOptions };

export interface ChartEvents {
  crosshair: CrosshairInfo | null;
  rangechange: VisibleRange;
  /** Older candles are needed before `before` (ms). Call prependData() with them. */
  requesthistory: { before: number };
  /** The user tried to zoom in past the limit for this timeframe. */
  zoomlimit: { minCandles: number };
  /** Following the live edge turned on or off (e.g. the user panned away). */
  followchange: { following: boolean };
  click: CrosshairInfo;
  /** The list of indicators changed (e.g. the user closed one from its pane). */
  indicatorschange: IndicatorInfo[];
}

export interface IndicatorInfo {
  key: string;
  id: string;
  label: string;
  params: Record<string, number>;
  placement: "main" | "pane";
}

interface ActiveIndicator {
  def: IndicatorDefinition;
  params: Record<string, number>;
  cache: { version: number; out: IndicatorOutput } | null;
  /** Share of the chart height (panes only). */
  frac: number;
}

interface PaneBox { key: string | null; top: number; h: number; min?: number; max?: number }
interface Hit { x: number; y: number; w: number; h: number; run: () => void }

type Handler<T> = (e: T) => void;

const AXIS_H = 26;
const PAD_TOP = 34; // room for the legend
const PAD_BOTTOM = 10;

export class Chart {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private store: CandleStore;
  private tf: ParsedTimeframe;
  private opts: Required<Omit<ChartOptions, "theme" | "symbol">> & { symbol: string };
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
  private dataVersion = 0;
  private historyRequestedFor = NaN;
  private lastRange: VisibleRange = { from: 0, to: 0 };
  private indicators = new Map<string, ActiveIndicator>();
  private layoutBoxes: PaneBox[] = [];
  private hits: Hit[] = [];
  private paneDrag: { index: number; y: number; above: number; below: number } | null = null;

  // input
  private pointer: { x: number; y: number } | null = null;
  private drag: { x: number; rightTime: number; moved: boolean; id: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; msPerPx: number; anchorTime: number; anchorX: number } | null = null;
  private resizeObs: ResizeObserver | null = null;
  private interObs: IntersectionObserver | null = null;
  private cleanups: (() => void)[] = [];

  constructor(private container: HTMLElement, options: ChartOptions = {}) {
    this.opts = {
      type: options.type ?? "candles",
      timeframe: options.timeframe ?? "1m",
      precision: options.precision ?? "auto",
      fps: options.fps ?? 60,
      timezone: options.timezone ?? "local",
      countdown: options.countdown ?? true,
      priceLine: options.priceLine ?? "short",
      rightPadding: options.rightPadding ?? 0.2,
      minVisibleCandles: options.minVisibleCandles ?? 12,
      emphasisDigits: options.emphasisDigits ?? 3,
      animate: options.animate ?? true,
      symbol: options.symbol ?? "",
    };
    this.tf = parseTimeframe(this.opts.timeframe);
    this.store = new CandleStore(this.tf);
    this.setTheme(options.theme ?? "dark");

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:crosshair";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Price chart");
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
    this.store.set(candles);
    this.onDataChanged(true);
  }

  /** Adds older candles (e.g. in answer to "requesthistory") without moving the view. */
  prependData(candles: readonly Candle[]): void {
    const added = this.store.prepend(candles);
    if (added > 0) this.historyRequestedFor = NaN;
    this.onDataChanged(false);
  }

  /** A live trade or quote: grows the current candle or starts the next one. */
  tick(t: Tick): void {
    const r = this.store.tick(t);
    if (r === "ignored") return;
    if (!Number.isFinite(this.displayPrice) || !this.animated) this.displayPrice = t.price;
    this.onDataChanged(false);
  }

  /** A whole candle (e.g. from a kline stream): replaces the current one or appends a new one. */
  update(c: Candle): void {
    const r = this.store.upsert(c);
    if (r === "ignored") return;
    if (!Number.isFinite(this.displayPrice) || !this.animated) this.displayPrice = c.close;
    this.onDataChanged(false);
  }

  /** All candles currently held (oldest first). */
  get data(): readonly Candle[] { return this.store.all; }

  // ================================================================ public API: settings

  setType(type: ChartType): void { this.opts.type = type; this.markDirty(); }
  get type(): ChartType { return this.opts.type; }

  /** Changes the timeframe. Existing candles are regrouped (only to a coarser timeframe makes sense); load fresh history for best results. */
  setTimeframe(tf: Timeframe): void {
    const parsed = parseTimeframe(tf);
    const old = this.store.all, oldMs = this.tf.ms;
    this.opts.timeframe = tf;
    this.tf = parsed;
    this.store = new CandleStore(parsed);
    // candles can be merged into a coarser timeframe, but not split into a finer one
    this.store.set(parsed.ms >= oldMs ? old : []);
    this.msPerPx = 0; // recompute a default zoom for this timeframe
    this.following = true;
    this.onDataChanged(true);
  }
  get timeframe(): Timeframe { return this.opts.timeframe; }

  setTheme(theme: "dark" | "light" | Theme): void {
    this.theme = theme === "light" ? LIGHT : theme === "dark" ? DARK : { ...DARK, ...theme };
    this.markDirty();
  }

  setOptions(o: Partial<ChartOptions>): void {
    if (o.type) this.setType(o.type);
    if (o.timeframe && o.timeframe !== this.opts.timeframe) this.setTimeframe(o.timeframe);
    if (o.theme) this.setTheme(o.theme);
    for (const k of ["precision", "fps", "timezone", "countdown", "priceLine", "rightPadding", "minVisibleCandles", "emphasisDigits", "animate", "symbol"] as const) {
      if (o[k] !== undefined) (this.opts as Record<string, unknown>)[k] = o[k];
    }
    this.markDirty();
  }

  // ================================================================ public API: overlays

  addMarker(o: MarkerOptions): string { return this.addOverlay({ kind: "marker", o }); }
  addPriceLine(o: PriceLineOptions): string { return this.addOverlay({ kind: "priceLine", o }); }
  addTimeLine(o: TimeLineOptions): string { return this.addOverlay({ kind: "timeLine", o }); }
  addZone(o: ZoneOptions): string { return this.addOverlay({ kind: "zone", o }); }

  /** Changes an overlay's options (merged). */
  updateOverlay(id: string, patch: Partial<MarkerOptions & PriceLineOptions & TimeLineOptions & ZoneOptions>): void {
    const ov = this.overlays.get(id);
    if (!ov) return;
    ov.o = { ...ov.o, ...patch } as never;
    this.markDirty();
  }
  removeOverlay(id: string): void { if (this.overlays.delete(id)) this.markDirty(); }
  clearOverlays(): void { this.overlays.clear(); this.markDirty(); }

  // ================================================================ public API: indicators

  /**
   * Adds a built-in or registered indicator: "sma", "ema", "bb", "rsi", "macd", "volume".
   * Params by name ({ period: 14 }) or in order ([12, 26, 9]). Returns a key for update/remove.
   */
  addIndicator(id: string, params?: Record<string, number> | number[]): string {
    const def = getIndicator(id.toLowerCase());
    if (!def) throw new Error(`Unknown indicator "${id}".`);
    const key = "ind" + this.nextId++;
    this.indicators.set(key, { def, params: resolveParams(def, params), cache: null, frac: def.id === "volume" ? 0.16 : 0.22 });
    this.markDirty();
    return key;
  }
  updateIndicator(key: string, params: Record<string, number> | number[]): void {
    const ind = this.indicators.get(key);
    if (!ind) return;
    ind.params = resolveParams(ind.def, Array.isArray(params) ? params : { ...ind.params, ...params });
    ind.cache = null;
    this.markDirty();
  }
  removeIndicator(key: string): void { if (this.indicators.delete(key)) this.markDirty(); }
  clearIndicators(): void { this.indicators.clear(); this.markDirty(); }
  get indicatorList(): IndicatorInfo[] {
    return [...this.indicators.entries()].map(([key, i]) => ({ key, id: i.def.id, label: i.def.label(i.params), params: { ...i.params }, placement: i.def.placement }));
  }

  // ================================================================ public API: view

  zoomIn(): void { this.zoomAt(this.plotW() * (this.following ? 1 - this.opts.rightPadding : 0.5), 1 / 1.6); }
  zoomOut(): void { this.zoomAt(this.plotW() * (this.following ? 1 - this.opts.rightPadding : 0.5), 1.6); }
  /** Back to the live edge, following new prices. */
  goLive(): void { this.setFollowing(true); this.markDirty(); }
  get isFollowing(): boolean { return this.following; }
  /** Shows the whole history. */
  fitContent(): void {
    const first = this.store.first, last = this.store.last;
    if (!first || !last) return;
    const span = this.store.endOf(last) - first.time;
    this.msPerPx = Math.max(this.minMsPerPx(), span / (this.plotW() * (1 - this.opts.rightPadding)));
    this.setFollowing(true);
    this.markDirty();
  }
  get visibleRange(): VisibleRange { return { ...this.lastRange }; }

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

  private get animated(): boolean { return this.opts.animate && !this.reducedMotion; }

  private addOverlay(ov: Overlay): string {
    const id = "tl" + this.nextId++;
    this.overlays.set(id, ov);
    this.markDirty();
    return id;
  }

  private onDataChanged(reset: boolean): void {
    this.dataVersion++;
    if (reset) {
      const last = this.store.last;
      this.displayPrice = last ? last.close : NaN;
      this.scaleReady = false;
      this.historyRequestedFor = NaN;
      this.following = true;
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

  private plotW(): number { return Math.max(1, this.w - this.axisW); }
  private plotH(): number { return Math.max(1, this.h - AXIS_H); }
  private minMsPerPx(): number { return (this.tf.ms * this.opts.minVisibleCandles) / this.plotW(); }
  private maxMsPerPx(): number { return (this.tf.ms * 3000) / this.plotW(); }
  private defaultMsPerPx(): number { return (this.tf.ms * 60) / this.plotW(); } // about 60 candles

  private timeToX(t: number): number { return this.plotW() - (this.rightTime - t) / this.msPerPx; }
  private xToTime(x: number): number { return this.rightTime - (this.plotW() - x) * this.msPerPx; }
  /** Height of the price pane (the rest goes to indicator panes). */
  private mainH(): number { return this.layoutBoxes[0]?.h ?? this.plotH(); }
  /** Room at the top of the price pane for the legend (one more row when price indicators are on). */
  private padTop(): number { return PAD_TOP + ([...this.indicators.values()].some((i) => i.def.placement === "main") ? 18 : 0); }

  private computeLayout(): PaneBox[] {
    const ph = this.plotH();
    const subs = [...this.indicators.entries()].filter(([, i]) => i.def.placement === "pane");
    let fracs = subs.map(([, i]) => i.frac);
    const total = fracs.reduce((a, b) => a + b, 0);
    if (total > 0.75) fracs = fracs.map((f) => (f * 0.75) / total); // the price pane keeps at least a quarter
    const heights = fracs.map((f) => Math.max(48, Math.round(f * ph)));
    const mainH = Math.max(80, ph - heights.reduce((a, b) => a + b, 0));
    const boxes: PaneBox[] = [{ key: null, top: 0, h: mainH }];
    let top = mainH;
    subs.forEach(([key], i) => { boxes.push({ key, top, h: heights[i] }); top += heights[i]; });
    return boxes;
  }

  private priceToY(p: number): number {
    const top = this.padTop(), bottom = this.mainH() - PAD_BOTTOM;
    return bottom - ((p - this.priceMin) / (this.priceMax - this.priceMin || 1)) * (bottom - top);
  }
  private yToPrice(y: number): number {
    const top = this.padTop(), bottom = this.mainH() - PAD_BOTTOM;
    return this.priceMin + ((bottom - y) / (bottom - top)) * (this.priceMax - this.priceMin);
  }

  private setFollowing(f: boolean): void {
    if (f === this.following) return;
    this.following = f;
    this.emit("followchange", { following: f });
  }

  private zoomAt(x: number, factor: number): void {
    if (!this.msPerPx) return;
    const anchor = this.xToTime(x);
    const next = this.msPerPx * factor;
    const min = this.minMsPerPx(), max = this.maxMsPerPx();
    if (factor < 1 && this.msPerPx <= min * 1.001) { this.emit("zoomlimit", { minCandles: this.opts.minVisibleCandles }); return; }
    this.msPerPx = Math.min(max, Math.max(min, next));
    if (!this.following) this.rightTime = anchor + (this.plotW() - x) * this.msPerPx;
    this.markDirty();
  }

  private resize(): void {
    const r = this.container.getBoundingClientRect();
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
    const animating = live || gliding || (this.animated && this.isLive());
    if (!force && !this.dirty && !animating) return;
    if (!force && now - this.lastFrame < minGap - 1) { this.kick(); return; }
    const dt = Math.min(250, now - (this.lastFrame || now));
    this.lastFrame = now;
    this.dirty = false;
    this.step(dt);
    this.draw(now);
    if (animating) this.kick();
  }

  /** Advances animated values: live price glide, scrolling, price-scale easing. */
  private step(dt: number): void {
    const last = this.store.last;
    if (!this.msPerPx) this.msPerPx = Math.min(this.maxMsPerPx(), Math.max(this.minMsPerPx(), this.defaultMsPerPx()));
    // live price glides towards the last tick
    if (last) {
      if (!Number.isFinite(this.displayPrice) || !this.animated) this.displayPrice = last.close;
      else this.displayPrice += (last.close - this.displayPrice) * (1 - Math.exp(-dt / 110));
      if (Math.abs(last.close - this.displayPrice) < Math.abs(last.close) * 1e-9) this.displayPrice = last.close;
    }
    // the view follows the live edge, with empty space on the right
    if (this.following) this.rightTime = this.liveTime() + this.plotW() * this.opts.rightPadding * this.msPerPx;
    // price axis fits the visible candles, easing so it never jumps
    const target = this.visibleExtent();
    if (target) {
      const [lo, hi] = target;
      if (!this.scaleReady || !this.animated) { this.priceMin = lo; this.priceMax = hi; this.scaleReady = true; }
      else {
        const k = 1 - Math.exp(-dt / 140);
        this.priceMin += (lo - this.priceMin) * k;
        this.priceMax += (hi - this.priceMax) * k;
      }
    }
    // history: ask for more when the left edge nears the first candle
    const first = this.store.first;
    const leftTime = this.xToTime(0);
    if (first && leftTime < first.time + this.plotW() * 0.25 * this.msPerPx && this.historyRequestedFor !== first.time) {
      this.historyRequestedFor = first.time;
      this.emit("requesthistory", { before: first.time });
    }
    const range = { from: leftTime, to: this.rightTime };
    if (Math.abs(range.from - this.lastRange.from) > this.msPerPx || Math.abs(range.to - this.lastRange.to) > this.msPerPx) {
      this.lastRange = range;
      this.emit("rangechange", range);
    }
  }

  private series(): readonly Candle[] {
    if (this.opts.type !== "heikin-ashi") return this.store.all;
    if (!this.haCache || this.haCache.version !== this.dataVersion) this.haCache = { version: this.dataVersion, data: heikinAshi(this.store.all) };
    return this.haCache.data;
  }

  /** Candles in view (with one extra on each side), and the live candle adjusted to the gliding price. */
  private visibleCandles(): { list: readonly Candle[]; from: number; to: number } {
    const all = this.series();
    const from = Math.max(0, this.store.indexAtOrAfter(this.xToTime(0) - this.tf.ms) - 1);
    const to = Math.min(all.length, this.store.indexAtOrAfter(this.xToTime(this.plotW()) + this.tf.ms) + 1);
    return { list: all, from, to };
  }

  private liveCandle(c: Candle, isLast: boolean): Candle {
    if (!isLast || !Number.isFinite(this.displayPrice) || this.opts.type === "heikin-ashi") return c;
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
    for (const ind of this.indicators.values()) {
      if (ind.def.placement !== "main") continue;
      const out = this.output(ind);
      for (const line of out.lines) for (let i = from; i < to; i++) {
        const v = line.values[i];
        if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
    }
    if (!Number.isFinite(lo)) {
      const last = this.store.last;
      if (!last) return null;
      lo = last.low; hi = last.high;
    }
    if (hi - lo < Math.abs(hi) * 1e-6) { const pad = Math.abs(hi) * 0.001 || 1; lo -= pad; hi += pad; }
    const pad = (hi - lo) * 0.08;
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
    ctx.font = `11px ${th.monoFont}`;
    const sample = formatPrice(Math.max(Math.abs(this.priceMax), Math.abs(this.priceMin)), dec);
    this.axisW = Math.max(64, Math.ceil(ctx.measureText(sample).width + 34));
    const pw = this.plotW(), ph = this.plotH();
    this.layoutBoxes = this.computeLayout();
    this.hits = [];
    const mh = this.mainH();

    // grid + axes
    const pTicks = priceTicks(this.priceMin, this.priceMax, Math.max(2, Math.floor((mh - this.padTop()) / 64)));
    const pStep = pTicks.length > 1 ? pTicks[1] - pTicks[0] : niceStep(this.priceMax - this.priceMin, 4);
    const left = this.xToTime(0), right = this.xToTime(pw);
    const tTicks = timeTicks(left, right, 110 * this.msPerPx, this.tz(right));
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.grid;
    ctx.beginPath();
    for (const p of pTicks) { const y = crisp(this.priceToY(p)); if (y < mh) { ctx.moveTo(0, y); ctx.lineTo(pw, y); } }
    for (const t of tTicks) { const x = crisp(this.timeToX(t.time)); ctx.moveTo(x, 0); ctx.lineTo(x, ph); }
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, mh);
    ctx.clip();
    this.drawZones();
    this.drawSeries();
    this.drawMainIndicators();
    this.drawOverlays();
    this.drawLivePoint(now);
    ctx.restore();
    this.drawPanes();

    // axis lines
    ctx.strokeStyle = th.axisLine;
    ctx.beginPath();
    ctx.moveTo(crisp(pw), 0); ctx.lineTo(crisp(pw), ph);
    ctx.moveTo(0, crisp(ph)); ctx.lineTo(this.w, crisp(ph));
    ctx.stroke();

    // price labels
    ctx.fillStyle = th.text;
    ctx.font = `11px ${th.monoFont}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const labelDec = Math.max(stepDecimals(pStep), 0);
    for (const p of pTicks) {
      const y = this.priceToY(p);
      if (y < 8 || y > mh - 8) continue;
      ctx.fillText(formatPrice(p, Math.min(dec, labelDec)), pw + 10, y);
    }
    // time labels
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of tTicks) {
      const x = this.timeToX(t.time);
      if (x < 24 || x > pw - 24) continue;
      ctx.fillStyle = t.major ? th.textStrong : th.text;
      ctx.fillText(t.label, x, ph + AXIS_H / 2);
    }

    this.drawPriceLineLabels(dec);
    this.drawLiveTag(dec);
    this.drawCrosshair(dec);
    this.drawLegend(dec);
  }

  private drawSeries(): void {
    const { ctx, theme: th } = this;
    const { list, from, to } = this.visibleCandles();
    if (to <= from) return;
    const lastIdx = list.length - 1;
    const candlePx = this.tf.ms / this.msPerPx;
    const type = this.opts.type;

    if (type === "line" || type === "area") {
      const live = this.liveTime();
      const pts: [number, number][] = [];
      for (let i = from; i < to; i++) {
        const c = this.liveCandle(list[i], i === lastIdx);
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
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      return;
    }

    const bodyW = Math.max(1, Math.min(candlePx * 0.72, candlePx - 1));
    const thin = bodyW < 3;
    for (const dir of [1, -1]) {
      ctx.fillStyle = ctx.strokeStyle = dir > 0 ? th.up : th.down;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        const c = this.liveCandle(list[i], i === lastIdx);
        const up = c.close >= c.open;
        if ((dir > 0) !== up) continue;
        const cx = this.timeToX(c.time + this.tf.ms / 2);
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
        ctx.moveTo(x, yH); ctx.lineTo(x, top);
        ctx.moveTo(x, top + bh); ctx.lineTo(x, yL);
        if (thin) { ctx.moveTo(x, top); ctx.lineTo(x, top + bh); continue; }
        if (type === "hollow" && up) ctx.rect(Math.round(cx - bodyW / 2) + 0.5, Math.round(top) + 0.5, Math.round(bodyW) - 1, Math.max(1, Math.round(bh) - 1));
      }
      ctx.stroke();
      if (type === "bars" || thin) continue;
      // bodies
      for (let i = from; i < to; i++) {
        const c = this.liveCandle(list[i], i === lastIdx);
        const up = c.close >= c.open;
        if ((dir > 0) !== up || (type === "hollow" && up)) continue;
        const cx = this.timeToX(c.time + this.tf.ms / 2);
        const yO = this.priceToY(c.open), yC = this.priceToY(c.close);
        const top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
        ctx.fillRect(Math.round(cx - bodyW / 2), Math.round(top), Math.round(bodyW), Math.max(1, Math.round(bh)));
      }
    }
  }

  private drawZones(): void {
    const { ctx } = this;
    for (const ov of this.overlays.values()) {
      if (ov.kind !== "zone") continue;
      const z = ov.o;
      const y1 = z.from === "top" ? 0 : this.priceToY(z.from);
      const y2 = z.to === "bottom" ? this.mainH() : this.priceToY(z.to);
      const x1 = z.start !== undefined ? this.timeToX(z.start) : 0;
      const x2 = z.end !== undefined ? this.timeToX(z.end) : this.plotW();
      ctx.fillStyle = z.color;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
  }

  private drawOverlays(): void {
    const { ctx, theme: th } = this;
    const pw = this.plotW(), ph = this.mainH();
    for (const ov of this.overlays.values()) {
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
        const parts = [o.label, o.countdown ? formatCountdown(o.time - Date.now()) : ""].filter(Boolean).join("  ");
        if (parts) pill(ctx, parts, x, this.padTop() - 18, { bg: color, fg: th.background, font: `600 11px ${th.monoFont}`, align: "center", within: [4, pw - 4] });
      }
    }
    for (const ov of this.overlays.values()) {
      if (ov.kind !== "marker") continue;
      const o = ov.o;
      const x = this.timeToX(o.time), y = this.priceToY(o.price);
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
      pill(ctx, text.trim() || "•", x, ly, { bg: color, fg: "#fff", font: `600 11px ${th.font}`, align: "center" });
    }
  }

  private drawPriceLineLabels(dec: number): void {
    const { ctx, theme: th } = this;
    for (const ov of this.overlays.values()) {
      if (ov.kind !== "priceLine") continue;
      const o = ov.o;
      const y = this.priceToY(o.price);
      if (y < 0 || y > this.mainH()) continue;
      const color = o.color ?? th.accent;
      if (o.axisLabel !== false) pill(ctx, formatPrice(o.price, dec), this.plotW() + 4, y, { bg: color, fg: "#fff", font: `11px ${th.monoFont}`, align: "left", width: this.axisW - 8 });
      if (o.label) {
        const x = o.from !== undefined ? Math.max(6, this.timeToX(o.from) + 6) : 8;
        pill(ctx, o.label, x, y - 11, { bg: color, fg: "#fff", font: `600 10px ${th.font}`, align: "left" });
      }
    }
  }

  private drawLivePoint(now: number): void {
    const { ctx, theme: th } = this;
    const last = this.store.last;
    if (!last || !Number.isFinite(this.displayPrice)) return;
    const y = this.priceToY(this.displayPrice);
    const lineType = this.opts.type === "line" || this.opts.type === "area";
    const x = lineType ? this.timeToX(this.liveTime()) : this.timeToX(last.time + this.tf.ms / 2);
    const color = th.accent;
    // price line
    if (this.opts.priceLine !== "none") {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 3]);
      ctx.beginPath();
      ctx.moveTo(this.opts.priceLine === "full" ? 0 : x, crisp(y));
      ctx.lineTo(this.plotW(), crisp(y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // glow dot, pulsing while live
    if (this.isLive()) {
      const pulse = this.animated ? (Math.sin(now / 420) + 1) / 2 : 0.5;
      const r = 10 + pulse * 6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha(color, 0.55));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      // time left in the candle
      if (this.opts.countdown && this.tf.ms >= 2000) {
        const left = this.store.endOf(last) - Date.now();
        if (left > 0) pill(ctx, formatCountdown(left), x + (lineType ? 12 : Math.max(10, this.tf.ms / this.msPerPx / 2 + 6)), y - 14,
          { bg: withAlpha(th.background, 0.85), fg: th.textStrong, font: `11px ${th.monoFont}`, align: "left", border: th.axisLine });
      }
    }
  }

  private drawLiveTag(dec: number): void {
    const { ctx, theme: th } = this;
    if (!this.store.last || !Number.isFinite(this.displayPrice)) return;
    const y = Math.min(this.mainH() - 10, Math.max(10, this.priceToY(this.displayPrice)));
    const shown = this.store.last.close; // the tag shows the real last price; only the line glides
    const [head, tail] = splitEmphasis(formatPrice(shown, dec), this.opts.emphasisDigits);
    const x = this.plotW() + 1, w = this.axisW - 2, h = 22;
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
    ctx.font = `11px ${th.monoFont}`;
    const hw = ctx.measureText(head).width;
    ctx.font = `700 13px ${th.monoFont}`;
    const tw = ctx.measureText(tail).width;
    const startX = x + 6 + Math.max(4, (w - 6 - hw - tw) / 2);
    ctx.font = `11px ${th.monoFont}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(head, startX, y + 0.5);
    ctx.globalAlpha = 1;
    ctx.font = `700 13px ${th.monoFont}`;
    ctx.fillText(tail, startX + hw, y + 0.5);
  }

  private drawCrosshair(dec: number): void {
    const p = this.pointer;
    if (!p || this.drag?.moved) return;
    const { ctx, theme: th } = this;
    const pw = this.plotW(), ph = this.plotH();
    if (p.x < 0 || p.x > pw || p.y < 0 || p.y > ph) return;
    const t = this.xToTime(p.x);
    const c = this.store.candleAt(t);
    const snapX = c ? this.timeToX(c.time + this.tf.ms / 2) : p.x;
    ctx.strokeStyle = th.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(crisp(snapX), 0); ctx.lineTo(crisp(snapX), ph);
    ctx.moveTo(0, crisp(p.y)); ctx.lineTo(pw, crisp(p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    const box = this.layoutBoxes.find((b) => p.y >= b.top && p.y < b.top + b.h);
    const value = !box || box.key === null ? formatPrice(this.yToPrice(p.y), dec) : this.paneValueLabel(box, p.y);
    pill(ctx, value, pw + 4, p.y, { bg: th.pillBackground, fg: th.pillText, font: `11px ${th.monoFont}`, align: "left", width: this.axisW - 8 });
    const at = c ? c.time : t;
    const full = formatTime(at, "full", this.tz(at)); // 2026-11-03 20:07:15
    const tLabel = this.tf.ms < MS.MIN ? full : this.tf.ms < MS.DAY ? full.slice(0, 16) : full.slice(0, 10);
    pill(ctx, tLabel, snapX, ph + AXIS_H / 2, { bg: th.pillBackground, fg: th.pillText, font: `11px ${th.monoFont}`, align: "center" });
  }

  /** Top-left: symbol, timeframe, and the hovered (or last) candle's values. */
  private drawLegend(dec: number): void {
    const { ctx, theme: th } = this;
    const hovered = this.pointer && !this.drag?.moved && this.pointer.x <= this.plotW() ? this.store.candleAt(this.xToTime(this.pointer.x)) : null;
    const c = hovered ?? this.store.last;
    let x = 12;
    const y = 18;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (this.opts.symbol) {
      ctx.font = `600 13px ${th.font}`;
      ctx.fillStyle = th.textStrong;
      ctx.fillText(this.opts.symbol, x, y);
      x += ctx.measureText(this.opts.symbol).width + 8;
    }
    ctx.font = `12px ${th.font}`;
    ctx.fillStyle = th.text;
    ctx.fillText(this.opts.timeframe, x, y);
    x += ctx.measureText(this.opts.timeframe).width + 14;
    if (!c) return;
    const close = hovered ? c.close : this.store.last!.close;
    const color = close >= c.open ? th.up : th.down;
    ctx.font = `11px ${th.monoFont}`;
    for (const [k, v] of [["O", c.open], ["H", c.high], ["L", c.low], ["C", close]] as const) {
      ctx.fillStyle = th.text;
      ctx.fillText(k, x, y);
      x += ctx.measureText(k).width + 4;
      ctx.fillStyle = color;
      const s = formatPrice(v, dec);
      ctx.fillText(s, x, y);
      x += ctx.measureText(s).width + 10;
      if (x > this.plotW() - 60) return;
    }
    const chg = c.open ? ((close - c.open) / c.open) * 100 : 0;
    ctx.fillStyle = color;
    ctx.fillText(`${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%`, x, y);
    this.drawMainIndicatorLegend(dec, hovered);
  }

  /** Second legend row: each price-pane indicator with its value and a close button. */
  private drawMainIndicatorLegend(dec: number, hovered: Candle | null): void {
    const { ctx, theme: th } = this;
    let x = 12;
    const y = 36;
    const idx = hovered ? this.store.indexAtOrAfter(hovered.time) : this.store.length - 1;
    for (const [key, ind] of this.indicators) {
      if (ind.def.placement !== "main") continue;
      const out = this.output(ind);
      ctx.font = `11px ${th.font}`;
      ctx.fillStyle = out.lines[0]?.color ?? th.text;
      const label = ind.def.label(ind.params);
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 6;
      ctx.font = `11px ${th.monoFont}`;
      for (const line of out.lines) {
        const v = line.values[idx];
        if (!Number.isFinite(v)) continue;
        const s = formatPrice(v, dec);
        ctx.fillStyle = line.color;
        ctx.fillText(s, x, y);
        x += ctx.measureText(s).width + 6;
      }
      x = this.closeButton(x, y, () => { this.removeIndicator(key); this.emit("indicatorschange", this.indicatorList); }) + 14;
      if (x > this.plotW() - 80) break;
    }
  }

  // ================================================================ indicators: drawing

  private output(ind: ActiveIndicator): IndicatorOutput {
    if (!ind.cache || ind.cache.version !== this.dataVersion) ind.cache = { version: this.dataVersion, out: ind.def.compute(this.store.all, ind.params) };
    return ind.cache.out;
  }

  /** Lines and bands of indicators drawn over the price (inside the price pane's clip). */
  private drawMainIndicators(): void {
    const { ctx } = this;
    const { from, to } = this.visibleCandles();
    for (const ind of this.indicators.values()) {
      if (ind.def.placement !== "main") continue;
      const out = this.output(ind);
      if (out.band) {
        const up = out.lines[out.band.upper].values, lo = out.lines[out.band.lower].values;
        ctx.beginPath();
        let started = false;
        for (let i = from; i < to; i++) if (Number.isFinite(up[i])) { const x = this.candleX(i), y = this.priceToY(up[i]); if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; } }
        for (let i = to - 1; i >= from; i--) if (Number.isFinite(lo[i])) ctx.lineTo(this.candleX(i), this.priceToY(lo[i]));
        ctx.closePath();
        ctx.fillStyle = out.band.color;
        if (started) ctx.fill();
      }
      for (const line of out.lines) this.strokeLine(line.values, from, to, line.color, line.width ?? 1.5, (v) => this.priceToY(v));
    }
  }

  private candleX(i: number): number { return this.timeToX(this.store.at(i).time + this.tf.ms / 2); }

  private strokeLine(values: ArrayLike<number>, from: number, to: number, color: string, width: number, y: (v: number) => number): void {
    const { ctx } = this;
    ctx.beginPath();
    let pen = false;
    for (let i = from; i < to; i++) {
      const v = values[i];
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
    const barW = Math.max(1, Math.min(candlePx * 0.72, candlePx - 1));
    const hovered = this.pointer && !this.drag?.moved && this.pointer.x <= pw ? this.store.candleAt(this.xToTime(this.pointer.x)) : null;
    const idx = hovered ? this.store.indexAtOrAfter(hovered.time) : this.store.length - 1;

    for (const box of this.layoutBoxes.slice(1)) {
      const ind = this.indicators.get(box.key!);
      if (!ind) continue;
      const out = this.output(ind);
      // scale: fixed range, or fit the visible values (histograms include zero)
      let lo = Infinity, hi = -Infinity;
      if (out.range) [lo, hi] = out.range;
      else {
        const scan = (vals: ArrayLike<number>) => { for (let i = from; i < to; i++) { const v = vals[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } };
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
      ctx.beginPath(); ctx.rect(0, box.top + 1, pw, box.h - 1); ctx.clip();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = th.grid.replace(/[\d.]+\)$/, "0.25)");
      for (const lvl of out.levels ?? []) { const ly = crisp(y(lvl)); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(pw, ly); ctx.stroke(); }
      ctx.setLineDash([]);
      if (out.histogram) {
        const h = out.histogram, zero = y(Math.max(lo, Math.min(hi, 0)));
        for (const upPass of [1, 0]) {
          ctx.fillStyle = upPass ? h.upColor : h.downColor;
          for (let i = from; i < to; i++) {
            const v = h.values[i];
            if (!Number.isFinite(v) || h.up[i] !== upPass) continue;
            const x = this.candleX(i), yv = y(v);
            ctx.fillRect(Math.round(x - barW / 2), Math.min(zero, yv), Math.max(1, Math.round(barW)), Math.max(1, Math.abs(zero - yv)));
          }
        }
      }
      for (const line of out.lines) this.strokeLine(line.values, from, to, line.color, line.width ?? 1.5, y);
      ctx.restore();

      // axis labels
      ctx.font = `10px ${th.monoFont}`;
      ctx.fillStyle = th.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const ticks = out.range ? (out.levels ?? []) : priceTicks(lo, hi, Math.max(1, Math.floor(box.h / 40)));
      const step = ticks.length > 1 ? ticks[1] - ticks[0] : hi - lo;
      for (const t of ticks) {
        const ty = y(t);
        if (ty < box.top + 8 || ty > box.top + box.h - 6) continue;
        ctx.fillText(this.formatPaneValue(t, step), pw + 10, ty);
      }

      // header: name, values at the hovered (or last) candle, close button
      let x = 10;
      const hy = box.top + 12;
      ctx.font = `11px ${th.font}`;
      ctx.fillStyle = th.textStrong;
      const label = ind.def.label(ind.params);
      ctx.fillText(label, x, hy);
      x += ctx.measureText(label).width + 8;
      ctx.font = `11px ${th.monoFont}`;
      const vals: [string, number][] = out.lines.map((l) => [l.color, l.values[idx]]);
      if (out.histogram) vals.push([out.histogram.up[idx] ? out.histogram.upColor : out.histogram.downColor, out.histogram.values[idx]]);
      for (const [color, v] of vals) {
        if (!Number.isFinite(v)) continue;
        const s = this.formatPaneValue(v, step / 100);
        ctx.fillStyle = color.startsWith("rgba") ? color.replace(/[\d.]+\)$/, "1)") : color;
        ctx.fillText(s, x, hy);
        x += ctx.measureText(s).width + 8;
      }
      const key = box.key!;
      this.closeButton(x, hy, () => { this.removeIndicator(key); this.emit("indicatorschange", this.indicatorList); });
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
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(1) + "K";
    return formatPrice(v, Math.min(8, stepDecimals(Math.abs(step) || 1)));
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
    if (p.x > this.plotW()) return 0;
    for (let i = 1; i < this.layoutBoxes.length; i++) if (Math.abs(p.y - this.layoutBoxes[i].top) <= 4) return i;
    return 0;
  }

  private resizePanes(y: number): void {
    const d = this.paneDrag!;
    const dy = y - d.y;
    const minAbove = d.index === 1 ? 120 : 48;
    const above = Math.max(minAbove, d.above + dy), below = Math.max(48, d.above + d.below - above);
    const ph = this.plotH();
    const belowKey = this.layoutBoxes[d.index].key!, aboveKey = this.layoutBoxes[d.index - 1].key;
    this.indicators.get(belowKey)!.frac = below / ph;
    if (aboveKey) this.indicators.get(aboveKey)!.frac = above / ph;
    this.markDirty();
  }

  // ================================================================ input

  private local(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
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
      if (this.touches.size === 2) {
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
      if (p.x <= this.plotW()) this.drag = { x: p.x, rightTime: this.rightTime, moved: false, id: e.pointerId };
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
      if (!this.drag) c.style.cursor = this.dividerAt(p) > 0 ? "row-resize" : this.hitAt(p) ? "pointer" : "crosshair";
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = p.x - this.drag.x;
        if (Math.abs(dx) > 3) this.drag.moved = true;
        if (this.drag.moved) {
          this.setFollowing(false);
          this.rightTime = this.drag.rightTime - dx * this.msPerPx;
          c.style.cursor = "grabbing";
        }
      }
      if (e.pointerType === "mouse" || this.drag?.moved === false) this.pointer = p;
      this.emitCrosshair();
      this.markDirty();
    });

    const end = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.paneDrag) { this.paneDrag = null; c.style.cursor = "crosshair"; this.markDirty(); return; }
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
        if (this.drag.moved && this.rightTime >= this.liveTime() + this.plotW() * this.opts.rightPadding * this.msPerPx) this.setFollowing(true);
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
      e.preventDefault();
      const p = this.local(e);
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
        // horizontal trackpad scroll pans
        this.setFollowing(false);
        this.rightTime += e.deltaX * this.msPerPx;
        this.markDirty();
        return;
      }
      const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.zoomAt(this.following ? this.timeToX(this.liveTime()) : p.x, factor);
    }, { passive: false });

    on("dblclick", () => this.goLive());

    on("keydown", (e) => {
      const step = this.plotW() * 0.15 * this.msPerPx;
      let handled = true;
      switch (e.key) {
        case "ArrowLeft": this.setFollowing(false); this.rightTime -= step; break;
        case "ArrowRight": this.rightTime += step; if (this.rightTime >= this.liveTime()) this.setFollowing(true); break;
        case "+": case "=": this.zoomIn(); break;
        case "-": case "_": this.zoomOut(); break;
        case "End": this.goLive(); break;
        case "Home": this.fitContent(); break;
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

function dash(style: "solid" | "dashed" | "dotted"): number[] {
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
  o: { bg: string; fg: string; font: string; align: "left" | "center"; width?: number; border?: string; within?: [number, number] },
): void {
  ctx.font = o.font;
  const tw = ctx.measureText(text).width;
  const w = Math.max(o.width ?? 0, tw + 12), h = 18;
  let left = o.align === "center" ? x - w / 2 : x;
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
