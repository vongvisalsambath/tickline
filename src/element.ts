// <trade-chart>: the chart as a custom element, usable from plain HTML or any framework.
import { Chart, type ChartEvents, type IndicatorStyle } from "./chart";
import { DARK, LIGHT, resolveTheme } from "./theme";
import { parseIndicatorList } from "./indicators";
import { POINTS_NEEDED, type Drawing, type DrawingTool } from "./drawings";
import { applyOptions, defaultOptions, mergeDeep, type ChartOptions, type ResolvedOptions, type ThemeInput } from "./options";
import type {
  AlertOptions, AnimateOptions, Candle, ChartPoint, ChartType, HistoryLoader, HistoryState, ImageOptions, LayerOptions, MarkerOptions, PriceLineOptions, ShapeOptions, Theme, Tick, TimeLineOptions,
  VisibleRange, ZoneOptions,
} from "./types";
import type { ChartState } from "./chart";

/** Attributes and the setting each one controls. Removing an attribute restores that setting's default. */
const ATTRS = [
  "type", "timeframe", "theme", "symbol", "precision", "timezone", "locale", "fps", "font-size",
  "countdown", "price-line", "right-padding", "min-visible-candles", "emphasis-digits", "animate",
  "crosshair", "grid", "legend", "controls", "drawing-tools", "indicators", "options", "live-position", "watermark", "live-marker",
  "fullscreen-orientation", "animation-speed", "range-buttons",
] as const;
type Attr = (typeof ATTRS)[number];

const STYLE = `
:host { display: block; position: relative; height: 420px; min-height: 160px; contain: content; }
:host([fullscreen]) { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; height: 100dvh !important;
  max-width: none !important; max-height: none !important; min-height: 0; margin: 0 !important; border-radius: 0 !important; z-index: 2147483000;
  background: var(--tl-background, var(--_bg)); box-sizing: border-box;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
:host(:fullscreen) { width: 100%; height: 100%; }
.wrap { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
/* landscape (or portrait) on a phone that can't lock the screen: the chart turns a quarter clockwise */
:host([rotated]) .wrap { inset: auto !important; top: 0; left: 0; width: 100vh; width: 100dvh; height: 100vw;
  transform-origin: top left; transform: translateX(100vw) rotate(90deg); }
.texted { position: absolute; z-index: 3; min-width: 120px; max-width: 70%; padding: 4px 8px; border-radius: 6px; outline: none;
  font: 600 14px var(--tl-font, system-ui, sans-serif); color: var(--tl-text-strong, var(--_fg)); background: var(--_bg);
  border: 1px solid var(--tl-accent, var(--_accent)); box-shadow: 0 4px 16px rgba(0, 0, 0, .35); }
:host([fullscreen]) .wrap { inset: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.controls { position: absolute; left: 50%; bottom: 36px; transform: translateX(-50%); display: flex; gap: 4px; align-items: center;
  opacity: 0; transition: opacity .2s; pointer-events: none; }
.wrap:hover .controls, .controls:focus-within { opacity: 1; pointer-events: auto; }
/* touch screens have no hover: tapping the chart shows the buttons */
@media (hover: none) { .wrap:focus-within .controls { opacity: 1; pointer-events: auto; } }
/* ui.controlsVisible: "always", or "auto" (always on touch screens) */
.ctl-always .controls { opacity: 1; pointer-events: auto; }
@media (hover: none) { .ctl-auto .controls { opacity: 1; pointer-events: auto; } }
.ranges { position: absolute; left: 8px; bottom: 36px; display: flex; gap: 3px; max-width: calc(100% - 16px); overflow-x: auto; scrollbar-width: none; }
.ranges::-webkit-scrollbar { display: none; }
.ranges button { height: 24px; min-width: 0; padding: 0 8px; font-size: 11px; flex: none; }
.ranges button[aria-pressed="true"] { color: var(--tl-accent-text, #fff); background: var(--tl-accent, var(--_accent)); border-color: transparent; }
.tooled:not(.compact) .ranges { left: 48px; max-width: calc(100% - 56px); }
.mid .ranges { bottom: 70px; }
.compact.ranged .live { bottom: 104px; }
.controls .sep { width: 1px; height: 18px; margin: 0 3px; background: var(--tl-axis-line, var(--_line)); }
button { font: 600 13px/1 var(--tl-font, system-ui, sans-serif); min-width: 30px; height: 28px; padding: 0 9px; border-radius: 7px; cursor: pointer;
  color: var(--tl-text-strong, var(--_fg)); background: var(--_bg); background: color-mix(in srgb, var(--tl-background, var(--_bg)) 80%, transparent);
  border: 1px solid var(--tl-axis-line, var(--_line)); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  display: inline-grid; place-items: center; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
button:hover { border-color: var(--tl-accent, var(--_accent)); }
button:focus-visible { outline: 2px solid var(--tl-accent, var(--_accent)); outline-offset: 1px; }
button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.icon { width: 30px; min-width: 0; padding: 0; }
.controls [data-a="rotate"] { display: none; }
@media (hover: none) { :host([fullscreen]) .controls [data-a="rotate"]:not(.off) { display: inline-grid; } }
.live { position: absolute; right: 76px; bottom: 36px; display: none; color: var(--tl-accent-text, #fff);
  background: var(--tl-accent, var(--_accent)); border-color: transparent; }
.live.show { display: inline-flex; align-items: center; gap: 6px; }
.toast { position: absolute; left: 50%; top: 44px; transform: translate(-50%, -6px); padding: 7px 12px; border-radius: 8px;
  font: 500 12px var(--tl-font, system-ui, sans-serif); color: var(--tl-toast-text, #fff); background: var(--tl-toast-background, rgba(15, 18, 26, .92));
  opacity: 0; transition: opacity .2s, transform .2s; pointer-events: none; white-space: nowrap; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.tools { position: absolute; left: 8px; top: 58px; display: flex; flex-direction: column; gap: 4px; }
.tools .list { display: contents; }
.tools button { opacity: .8; }
.tools button:hover, .tools button[aria-pressed="true"], .tools button[aria-expanded="true"] { opacity: 1; }
.tools button[aria-pressed="true"] { color: var(--tl-accent-text, #fff); background: var(--tl-accent, var(--_accent)); border-color: transparent; }
.tools .toggle { display: none; }
.selbar { position: absolute; left: 50%; top: 52px; transform: translateX(-50%); display: none; gap: 6px; align-items: center; padding: 5px 6px;
  border-radius: 9px; background: var(--_bg); background: color-mix(in srgb, var(--tl-background, var(--_bg)) 88%, transparent);
  border: 1px solid var(--tl-axis-line, var(--_line)); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); max-width: calc(100% - 16px); flex-wrap: wrap; justify-content: center; }
.selbar.show { display: flex; }
.swatch { width: 18px; min-width: 0; height: 18px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
.swatch[aria-pressed="true"] { border-color: var(--tl-text-strong, var(--_fg)); }
.selbar .act { height: 24px; font-weight: 600; font-size: 12px; }
.selbar .act[aria-pressed="true"] { color: var(--tl-accent-text, #fff); background: var(--tl-accent, var(--_accent)); border-color: transparent; }
.off { display: none !important; }
/* small charts (narrow or short): the drawing tools fold into one button, the Live button sits above the zoom buttons */
.compact .tools .toggle { display: inline-grid; }
.compact .tools:not(.open) .list { display: none; }
.compact .tools.open .list { display: flex; flex-direction: column; gap: 4px; }
.compact .live { right: 50%; transform: translateX(50%); bottom: 72px; }
.compact.short .tools { top: 34px; }
@media (prefers-reduced-motion: reduce) { .controls, .toast { transition: none; } }
`;

const ICONS: Record<DrawingTool, string> = {
  arrow: '<path d="M3 13L13 3M7 3h6v6"/>',
  circle: '<circle cx="8" cy="8" r="5.5"/>',
  text: '<path d="M3 3.5h10M8 3.5V13M6 13h4"/>',
  rect: '<rect x="2.5" y="4" width="11" height="8" rx="1"/>',
  measure: '<path d="M8 2v12M2 8h12M5 5l3-3 3 3M5 11l3 3 3-3"/>',
  line: '<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1.4"/><circle cx="13" cy="3" r="1.4"/>',
  trend: '<path d="M2 14L14 4"/><circle cx="5" cy="11.5" r="1.4"/>',
  horizontal: '<path d="M2 8h12"/><circle cx="8" cy="8" r="1.4"/>',
  vertical: '<path d="M8 2v12"/><circle cx="8" cy="8" r="1.4"/>',
  fib: '<path d="M2 3h12M2 6.5h12M2 9.5h12M2 13h12" stroke-dasharray="0"/><path d="M3 13L13 3" stroke-dasharray="1.5 2"/>',
};

const UI_ICONS = {
  image: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7M5 6.5l3 3 3-3M2.5 11v2.5h11V11"/></svg>',
  expand: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
  shrink: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/></svg>',
  rotate: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="2" width="7" height="12" rx="1.5"/><path d="M1.5 9.5a6 6 0 0 0 4 4M14.5 6.5a6 6 0 0 0-4-4"/></svg>',
  pencil: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z"/><path d="M9.5 4l2.5 2.5"/></svg>',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const bool = (v: string | null, d: boolean) => (v === null || v === "" ? d : !/^(false|0|no|off|none)$/i.test(v.trim()));
const num = (v: string | null) => (v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** The settings one attribute stands for. A removed attribute (null) gives the default back. */
function attributeOptions(name: Attr, v: string | null): ChartOptions {
  const d = defaultOptions();
  switch (name) {
    case "type": return { type: (v as ChartType) || d.type };
    case "timeframe": return { timeframe: v || d.timeframe };
    case "symbol": return { symbol: v ?? "" };
    case "precision": return { precision: num(v) ?? "auto" };
    case "timezone": return { timezone: v === null || v === "" || v === "local" ? "local" : num(v) ?? "local" };
    case "locale": return { locale: v ?? "" };
    case "fps": return { fps: num(v) ?? d.fps };
    case "font-size": return { layout: { fontSize: num(v) ?? d.layout.fontSize } };
    case "countdown": return { lastPrice: { countdown: bool(v, true) } };
    case "price-line": return { lastPrice: { line: (v as ResolvedOptions["lastPrice"]["line"]) || d.lastPrice.line } };
    case "right-padding": return { timeScale: { rightPadding: num(v) ?? d.timeScale.rightPadding } };
    case "min-visible-candles": return { timeScale: { minVisibleCandles: num(v) ?? d.timeScale.minVisibleCandles } };
    case "emphasis-digits": return { lastPrice: { emphasisDigits: num(v) ?? d.lastPrice.emphasisDigits } };
    case "animate": return { animation: { enabled: bool(v, true) } };
    case "animation-speed": return { animation: { speed: num(v) ?? d.animation.speed } };
    case "range-buttons": {
      // "true", "false", or the ranges: "1h 4h 1D All"
      if (v === null || !bool(v, false) && v.trim() !== "") return { ui: { rangeButtons: false, ranges: d.ui.ranges } };
      if (v.trim() === "" || /^(true|on|yes)$/i.test(v.trim())) return { ui: { rangeButtons: true, ranges: d.ui.ranges } };
      return { ui: { rangeButtons: true, ranges: v.split(/[\s,]+/).filter(Boolean) } };
    }
    case "crosshair": return { crosshair: { mode: v === "free" || v === "hidden" ? v : v === "false" || v === "none" ? "hidden" : "snap" } };
    case "grid": {
      const g = (v ?? "both").trim().toLowerCase();
      return { grid: { horizontal: ["both", "true", "horizontal", ""].includes(g), vertical: ["both", "true", "vertical", ""].includes(g) } };
    }
    case "legend": return { legend: { visible: bool(v, true) } };
    case "watermark": return { watermark: { text: v ?? "" } };
    case "live-marker": {
      const m = (v ?? "").trim().toLowerCase();
      return { lastPrice: { marker: (["pulse", "ripple", "radar", "glow", "dot", "none"].includes(m) ? m : "pulse") as "pulse" } };
    }
    case "fullscreen-orientation": {
      const m = (v ?? "").trim().toLowerCase();
      return { ui: { fullscreenOrientation: m === "landscape" || m === "portrait" ? m : "auto" } };
    }
    case "live-position": {
      // "center", "0.5", "0.5 0.5", "0.8 0.3" (x then y); empty or removed for the default
      const t = (v ?? "").trim().toLowerCase();
      if (!t || t === "auto" || t === "none") return { livePosition: { x: null, y: null } };
      if (t === "center" || t === "centre") return { livePosition: { x: 0.5, y: 0.5 } };
      const [x, y] = t.split(/[\s,]+/).map((n) => num(n) ?? null);
      return { livePosition: { x: x ?? null, y: y ?? null } };
    }
    case "controls": {
      const on = v === null || v.trim().toLowerCase() !== "none";
      return { ui: { zoomButtons: on, liveButton: on, drawingToolbar: on, drawingBar: on, screenshotButton: on, fullscreenButton: on } };
    }
    case "drawing-tools": {
      if (v === null || v.trim() === "" || /^(true|all)$/i.test(v.trim())) return { ui: { drawingToolbar: true, drawingTools: d.ui.drawingTools } };
      if (!bool(v, true)) return { ui: { drawingToolbar: false } };
      const tools = v.split(/[\s,]+/).filter((t): t is DrawingTool => t in POINTS_NEEDED);
      return { ui: { drawingToolbar: tools.length > 0, drawingTools: tools } };
    }
    default: return {};
  }
}

/**
 * <trade-chart type="candles" timeframe="1m" theme="dark" symbol="BTC/USDT"></trade-chart>
 *
 * Configure with attributes (common settings), the `options` attribute (JSON, every setting),
 * or `setOptions()` / the `options` property from JavaScript. Events are DOM events named tl-<event>.
 */
// On the server (Next.js, Nuxt, SvelteKit, Angular SSR) there's no HTMLElement: use a stand-in so importing is safe.
const BaseElement: typeof HTMLElement = typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement);

export class TradeChartElement extends BaseElement {
  static get observedAttributes(): readonly string[] { return ATTRS; }

  private _chart: Chart | null = null;
  private root!: ShadowRoot;
  private wrap!: HTMLDivElement;
  private liveBtn!: HTMLButtonElement;
  private toast!: HTMLDivElement;
  private toastTimer = 0;
  private pending: (() => void)[] = [];
  /** Settings given before the element was connected. */
  private early: ChartOptions = {};
  /** Theme colours set from JavaScript (setOptions({ theme })), applied over the attribute and CSS variables. */
  private themeJs: Exclude<ThemeInput, "dark" | "light"> | null = null;
  private themeBase: "dark" | "light" | null = null;
  private following = true;

  /** The underlying engine (available after the element is connected). */
  get chart(): Chart | null { return this._chart; }

  connectedCallback(): void {
    if (this._chart) return;
    this.root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style><div class="wrap" part="chart"></div>
      <div class="controls" part="controls" role="toolbar">
        <button type="button" data-a="out">−</button>
        <button type="button" data-a="live">⌖</button>
        <button type="button" data-a="in">+</button>
        <span class="sep" aria-hidden="true"></span>
        <button type="button" class="icon" data-a="image">${UI_ICONS.image}</button>
        <button type="button" class="icon" data-a="fullscreen">${UI_ICONS.expand}</button>
        <button type="button" class="icon" data-a="rotate">${UI_ICONS.rotate}</button>
      </div>
      <button type="button" class="live" part="live-button" data-a="live"></button>
      <div class="ranges off" part="range-buttons" role="toolbar"></div>
      <div class="tools" part="drawing-tools" role="toolbar">
        <button type="button" class="icon toggle" aria-expanded="false">${UI_ICONS.pencil}</button><div class="list"></div></div>
      <div class="selbar" part="drawing-bar" role="toolbar"><span class="swatches" style="display:contents"></span>
        <button type="button" class="act" data-lock aria-pressed="false"></button>
        <button type="button" class="act" data-dup></button>
        <button type="button" class="act" data-del></button></div>
      <div class="toast" part="toast" role="status" aria-live="polite"></div>`;
    this.wrap = this.root.querySelector(".wrap")!;
    this.wrap.append(...["controls", "live", "ranges", "toast", "tools", "selbar"].map((c) => this.root.querySelector("." + c)!));
    this.liveBtn = this.root.querySelector(".live")!;
    this.toast = this.root.querySelector(".toast")!;
    this.setFallbackColours();

    // defaults ← options attribute (JSON) ← individual attributes ← settings given in JavaScript before connecting
    let initial: ChartOptions = this.jsonAttribute();
    for (const a of ATTRS) if (a !== "options" && a !== "theme" && a !== "indicators" && this.hasAttribute(a)) initial = mergeDeep(initial, attributeOptions(a, this.getAttribute(a)));
    initial = mergeDeep(initial, this.early);
    if (initial.theme) this.rememberTheme(initial.theme);
    this.early = {};
    this._chart = new Chart(this.wrap, { ...initial, theme: undefined });
    this.wrap.prepend(this._chart.canvas);
    this.watchSize();
    this.applyTheme();
    this.bindUi();

    const forward = <K extends keyof ChartEvents>(type: K) =>
      this._chart!.on(type, (detail) => this.dispatchEvent(new CustomEvent(`tl-${type}`, { detail, bubbles: true, composed: true })));
    (["crosshair", "rangechange", "requesthistory", "zoomlimit", "followchange", "click", "indicatorschange", "drawingschange", "drawingselect", "toolchange", "alert", "drawingcreate", "historystate"] as const).forEach(forward);
    this.applyIndicatorAttribute();
    this.applyUi();

    const queued = this.pending; this.pending = [];
    queued.forEach((f) => f());
  }

  disconnectedCallback(): void {
    // Keep the chart if the element is just being moved in the DOM.
    queueMicrotask(() => {
      if (this.isConnected) return;
      if (this.isFullscreen) this.exitFullscreen();
      this.sizeObs?.disconnect();
      this._chart?.destroy();
      this._chart = null;
    });
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (!this._chart || old === value) return;
    if (name === "theme") { this.applyTheme(); return; }
    if (name === "indicators") { this.applyIndicatorAttribute(); return; }
    if (name === "options") { this.setOptions(this.jsonAttribute()); return; }
    this.setOptions(attributeOptions(name as Attr, value));
  }

  // ---------------------------------------------------------------- settings

  /**
   * Changes any settings; groups merge with what's set. Works before the element is connected too.
   * @example chart.setOptions({ grid: { vertical: false }, crosshair: { mode: "free" }, labels: { live: "Live" } })
   */
  setOptions(o: ChartOptions): void {
    if (!this._chart) { this.early = mergeDeep(this.early, o); return; }
    if (o.theme) this.rememberTheme(o.theme);
    this._chart.setOptions({ ...o, theme: undefined });
    if (o.theme) this.applyTheme();
    this.applyUi();
  }

  /** Every setting with its current value. Assigning an object is the same as setOptions(). */
  get options(): ResolvedOptions { return this._chart?.options ?? applyOptions(defaultOptions(), this.early); }
  set options(o: ChartOptions) { this.setOptions(o); }

  /** The colours and fonts in use. */
  get currentTheme(): Theme { return this._chart?.currentTheme ?? { ...(this.getAttribute("theme") === "light" ? LIGHT : DARK) }; }

  // ---------------------------------------------------------------- properties mirroring attributes

  get type(): ChartType { return (this.getAttribute("type") as ChartType) || "candles"; }
  set type(v: ChartType) { this.setAttribute("type", v); }
  get timeframe(): string { return this.getAttribute("timeframe") || "1m"; }
  set timeframe(v: string) { this.setAttribute("timeframe", v); }
  get symbol(): string { return this.getAttribute("symbol") ?? ""; }
  set symbol(v: string) { this.setAttribute("symbol", v); }

  // ---------------------------------------------------------------- methods (queued until connected)

  setData(candles: readonly Candle[]): void { this.run((c) => c.setData(candles)); }
  prependData(candles: readonly Candle[]): void { this.run((c) => c.prependData(candles)); }
  tick(t: Tick): void { this.run((c) => c.tick(t)); }
  update(candle: Candle): void { this.run((c) => c.update(candle)); }
  /** All candles currently held (oldest first). Assigning is the same as setData(). */
  get data(): readonly Candle[] { return this._chart?.data ?? []; }
  set data(candles: readonly Candle[]) { this.setData(candles); }
  addMarker(o: MarkerOptions): string { return this.runId((c) => c.addMarker(o)); }
  addPriceLine(o: PriceLineOptions): string { return this.runId((c) => c.addPriceLine(o)); }
  addTimeLine(o: TimeLineOptions): string { return this.runId((c) => c.addTimeLine(o)); }
  addZone(o: ZoneOptions): string { return this.runId((c) => c.addZone(o)); }
  /** A shape from code (line, arrow, circle, ellipse, rect, polygon, path, text, image). Returns its id. */
  addShape(o: ShapeOptions): string { return this.runId((c) => c.addShape(o)); }
  get shapes() { return this._chart?.shapes ?? []; }
  /** Draws anything on the chart every frame. Returns a function that removes the layer. */
  addLayer(draw: Parameters<Chart["addLayer"]>[0], o?: LayerOptions): () => void {
    if (this._chart) return this._chart.addLayer(draw, o);
    throw new Error("<trade-chart> must be in the document before adding layers.");
  }
  /** Where a time and price are on screen, and back. */
  toScreen(p: ChartPoint): { x: number; y: number } { return this._chart?.toScreen(p) ?? { x: NaN, y: NaN }; }
  fromScreen(p: { x: number; y: number }): ChartPoint { return this._chart?.fromScreen(p) ?? { time: NaN, price: NaN }; }
  /** Opens the text editor on a text drawing. */
  editText(id: string): void { this.openTextEditor(id, false); }
  /** A price alert: fires the tl-alert event when the price crosses it. Returns its id (remove with removeOverlay). */
  addAlert(o: AlertOptions): string { return this.runId((c) => c.addAlert(o)); }
  get alerts() { return this._chart?.alerts ?? []; }
  updateOverlay(id: string, patch: Parameters<Chart["updateOverlay"]>[1]): void { this.run((c) => c.updateOverlay(id, patch)); }
  removeOverlay(id: string): void { this.run((c) => c.removeOverlay(id)); }
  clearOverlays(): void { this.run((c) => c.clearOverlays()); }
  /** Adds an indicator ("sma", "ema", "bb", "rsi", "macd", "volume" or one you registered). Returns its key. */
  addIndicator(id: string, params?: Record<string, number> | number[], style?: IndicatorStyle): string { return this.runId((c) => c.addIndicator(id, params, style)); }
  updateIndicator(key: string, params?: Record<string, number> | number[], style?: IndicatorStyle): void { this.run((c) => c.updateIndicator(key, params, style)); }
  removeIndicator(key: string): void { this.run((c) => c.removeIndicator(key)); }
  clearIndicators(): void { this.attrIndicatorKeys = []; this.run((c) => c.clearIndicators()); }
  get indicatorList() { return this._chart?.indicatorList ?? []; }
  /** The drawing the user has selected, or null. */
  get selectedDrawing(): Drawing | null { return this._chart?.selectedDrawing ?? null; }
  /** The drawing tool being placed, or null. */
  get drawingTool(): DrawingTool | null { return this._chart?.drawingTool ?? null; }
  /** Starts placing a drawing ("line", "trend", "arrow", "horizontal", "vertical", "rect", "circle", "fib", "measure", "text"), or stops with null. */
  setDrawingTool(tool: DrawingTool | null): void { this.run((c) => c.setDrawingTool(tool)); }
  /** All drawings as plain data (store it as JSON to restore later with setDrawings). */
  get drawings(): Drawing[] { return this._chart?.drawings ?? []; }
  set drawings(list: readonly Drawing[]) { this.setDrawings(list); }
  setDrawings(list: readonly Drawing[]): void { this.run((c) => c.setDrawings(list)); }
  addDrawing(d: Parameters<Chart["addDrawing"]>[0]): string { return this.runId((c) => c.addDrawing(d)); }
  updateDrawing(id: string, patch: Parameters<Chart["updateDrawing"]>[1]): void { this.run((c) => c.updateDrawing(id, patch)); }
  removeDrawing(id: string): void { this.run((c) => c.removeDrawing(id)); }
  duplicateDrawing(id: string): string | null { return this._chart?.duplicateDrawing(id) ?? null; }
  clearDrawings(): void { this.run((c) => c.clearDrawings()); }
  zoomIn(o?: AnimateOptions): void { this._chart?.zoomIn(o); }
  zoomOut(o?: AnimateOptions): void { this._chart?.zoomOut(o); }
  /** Zooms by a factor: 2 shows twice as much time, 0.5 half. */
  zoomBy(factor: number, o?: AnimateOptions): void { this._chart?.zoomBy(factor, o); }
  /** Shows a span up to the live edge: "30m", "4h", "1D", "1W", "1M", "1Y" or "All". */
  zoomTo(range: string, o?: AnimateOptions): void { this.run((c) => c.zoomTo(range, o)); }
  /** Back to the default zoom and an automatic price scale. */
  resetZoom(o?: AnimateOptions): void { this._chart?.resetZoom(o); }
  goLive(o?: AnimateOptions): void { this._chart?.goLive(o); }
  fitContent(o?: AnimateOptions): void { this._chart?.fitContent(o); }
  /** Fixes the price scale to a range, or back to automatic with null. */
  setPriceRange(range: { min: number; max: number } | null): void { this.run((c) => c.setPriceRange(range)); }
  get priceRange(): { min: number; max: number } { return this._chart?.priceRange ?? { min: 0, max: 0 }; }
  get autoScale(): boolean { return this._chart?.autoScale ?? true; }
  /** Loads candles page by page as the user scrolls back (and the first page when empty). null stops. */
  setHistoryLoader(loader: HistoryLoader | null): void { this.run((c) => c.setHistoryLoader(loader)); }
  /** Clears the candles and loads the latest page again. */
  reloadHistory(): void { this.run((c) => c.reloadHistory()); }
  /** Tries the last failed history page again. */
  retryHistory(): void { this.run((c) => c.retryHistory()); }
  get historyState(): HistoryState { return this._chart?.historyState ?? "idle"; }
  /** Plays the intro animation again. */
  playIntro(): void { this.run((c) => c.playIntro()); }
  /** The time range in view (ms). */
  get visibleRange(): VisibleRange { return this._chart?.visibleRange ?? { from: 0, to: 0 }; }
  /** Shows this time range; with { follow: true } keeps following the live price at this zoom. */
  setVisibleRange(range: VisibleRange, opts?: { follow?: boolean } & AnimateOptions): void { this.run((c) => c.setVisibleRange(range, opts)); }
  /** Scrolls so `time` sits at `position` across the chart (0 left, 0.5 middle, 1 right). */
  scrollToTime(time: number, position?: number, o?: AnimateOptions): void { this.run((c) => c.scrollToTime(time, position, o)); }
  /** Shows a "Loading…" placeholder, or hides it. */
  setLoading(on: boolean): void { this.run((c) => c.setLoading(on)); }
  /** The chart as an image Blob (PNG by default). */
  toBlob(o?: ImageOptions): Promise<Blob> { return this._chart ? this._chart.toBlob(o) : Promise.reject(new Error("<trade-chart> isn't in the page.")); }
  /** The chart as a data: URL (PNG by default). */
  toDataURL(o?: ImageOptions): string { return this._chart?.toDataURL(o) ?? ""; }
  /** Downloads the chart as an image. */
  downloadImage(filename?: string, o?: ImageOptions): Promise<void> { return this._chart ? this._chart.downloadImage(filename, o) : Promise.resolve(); }
  /** The user's chart (type, indicators, drawings, alerts, view) as JSON-safe data. */
  getState(): ChartState | null { return this._chart?.getState() ?? null; }
  /** Restores what getState() returned. */
  setState(state: Partial<ChartState>): void { this.run((c) => c.setState(state)); }

  private sizeObs: ResizeObserver | null = null;
  /** Marks small charts so the controls take less room. */
  private watchSize(): void {
    const update = () => {
      const r = { width: this.wrap.offsetWidth || this.wrap.getBoundingClientRect().width, height: this.wrap.offsetHeight || this.wrap.getBoundingClientRect().height };
      if (!r.width) return;
      this.wrap.classList.toggle("compact", r.width < 520 || r.height < 420);
      this.wrap.classList.toggle("short", r.height < 420);
      this.wrap.classList.toggle("mid", r.width < 760);
    };
    update();
    if (typeof ResizeObserver !== "undefined") { this.sizeObs = new ResizeObserver(update); this.sizeObs.observe(this.wrap); }
    else window.addEventListener("resize", update);
  }

  // ---------------------------------------------------------------- full screen

  private fakeFullscreen = false;
  private savedOverflow = "";
  /** True while the chart fills the screen. */
  get isFullscreen(): boolean { return this.hasAttribute("fullscreen"); }

  /**
   * Fills the screen with the chart. Uses the browser's full-screen mode where it's allowed, and
   * otherwise (e.g. iPhone Safari) covers the page. Fires tl-fullscreenchange.
   */
  private orientation: "auto" | "landscape" | "portrait" = "auto";
  private locked = false;
  /** The orientation asked for in full screen. */
  get fullscreenOrientation(): "auto" | "landscape" | "portrait" { return this.orientation; }

  async enterFullscreen(o: { orientation?: "auto" | "landscape" | "portrait" } = {}): Promise<void> {
    this.orientation = o.orientation ?? this._chart?.options.ui.fullscreenOrientation ?? "auto";
    if (this.isFullscreen) { await this.applyOrientation(); return; }
    const el = this as Omit<HTMLElement, "requestFullscreen"> & { requestFullscreen?: HTMLElement["requestFullscreen"]; webkitRequestFullscreen?: () => void };
    const doc = document as Document & { webkitFullscreenEnabled?: boolean };
    const native = el.requestFullscreen ? doc.fullscreenEnabled : el.webkitRequestFullscreen ? doc.webkitFullscreenEnabled : false;
    if (native) {
      try {
        this.toggleAttribute("fullscreen", true);
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" }); else el.webkitRequestFullscreen!();
        this.fakeFullscreen = false;
        await this.applyOrientation();
        this.fullscreenChanged();
        return;
      } catch { /* not allowed here: fall back to covering the page */ }
    }
    this.fakeFullscreen = true;
    this.savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    this.toggleAttribute("fullscreen", true);
    await this.applyOrientation();
    this.fullscreenChanged();
  }

  /** Switches full screen between landscape and portrait (on phones). */
  async rotate(): Promise<void> {
    const portraitNow = this.rotated ? !this.screenIsPortrait() : this.screenIsPortrait();
    this.orientation = portraitNow ? "landscape" : "portrait";
    if (!this.isFullscreen) await this.enterFullscreen({ orientation: this.orientation });
    else await this.applyOrientation();
    this.fullscreenChanged();
  }

  private get rotated(): boolean { return this.hasAttribute("rotated"); }
  private screenIsPortrait(): boolean { return window.innerHeight > window.innerWidth; }

  /** Locks the screen to the orientation asked for, or turns the chart where locking isn't possible. */
  private async applyOrientation(): Promise<void> {
    const want = this.orientation;
    const so = (screen as Screen & { orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> } }).orientation;
    this.locked = false;
    if (want !== "auto" && !this.fakeFullscreen && so?.lock) {
      try { await so.lock(want); this.locked = true; } catch { /* not allowed (desktop, iPhone): turn the chart instead */ }
    } else if (want === "auto" && so?.unlock) {
      try { so.unlock(); } catch { /* nothing locked */ }
    }
    this.updateRotation();
  }

  private updateRotation(): void {
    const want = this.orientation;
    const portrait = this.screenIsPortrait();
    const turn = this.isFullscreen && !this.locked && want !== "auto" && (want === "landscape" ? portrait : !portrait);
    if (turn === this.rotated) return;
    this.toggleAttribute("rotated", turn);
    this._chart?.setRotation(turn ? 90 : 0);
  }

  async exitFullscreen(): Promise<void> {
    if (!this.isFullscreen) return;
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    if (!this.fakeFullscreen && (document.fullscreenElement === this || doc.webkitFullscreenElement === this)) {
      try { if (document.exitFullscreen) await document.exitFullscreen(); else doc.webkitExitFullscreen?.(); } catch { /* already left */ }
    }
    if (this.fakeFullscreen) document.documentElement.style.overflow = this.savedOverflow;
    this.fakeFullscreen = false;
    this.toggleAttribute("fullscreen", false);
    if (this.locked) { try { screen.orientation?.unlock?.(); } catch { /* already unlocked */ } }
    this.locked = false;
    this.updateRotation();
    this.fullscreenChanged();
  }

  toggleFullscreen(): Promise<void> { return this.isFullscreen ? this.exitFullscreen() : this.enterFullscreen(); }

  private fullscreenChanged(): void {
    const on = this.isFullscreen;
    const b = this.root?.querySelector<HTMLElement>('[data-a="fullscreen"]');
    if (b && this._chart) {
      const L = this._chart.options.labels;
      b.innerHTML = on ? UI_ICONS.shrink : UI_ICONS.expand;
      b.setAttribute("aria-label", on ? L.exitFullscreen : L.fullscreen);
      b.title = `${on ? L.exitFullscreen : L.fullscreen} (F)`;
    }
    const rot = this.root?.querySelector<HTMLElement>('[data-a="rotate"]');
    if (rot && this._chart) { rot.setAttribute("aria-label", this._chart.options.labels.rotate); rot.title = this._chart.options.labels.rotate; }
    this.dispatchEvent(new CustomEvent("tl-fullscreenchange", {
      detail: { fullscreen: on, orientation: this.orientation, rotated: this.rotated }, bubbles: true, composed: true,
    }));
  }

  private run(f: (c: Chart) => void): void {
    if (this._chart) f(this._chart); else this.pending.push(() => f(this._chart!));
  }
  private runId(f: (c: Chart) => string): string {
    if (this._chart) return f(this._chart);
    throw new Error("<trade-chart> must be in the document before adding overlays, indicators or drawings.");
  }

  // ---------------------------------------------------------------- helpers

  private jsonAttribute(): ChartOptions {
    const raw = this.getAttribute("options");
    if (!raw || !raw.trim()) return {};
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) {
      console.warn(`<trade-chart>: the options attribute isn't valid JSON (${(e as Error).message}).`);
      return {};
    }
  }

  private attrIndicatorKeys: string[] = [];
  /** indicators="sma:20, rsi:14, volume" — replaces the indicators that came from the attribute. */
  private applyIndicatorAttribute(): void {
    const c = this._chart;
    if (!c) return;
    this.attrIndicatorKeys.forEach((k) => c.removeIndicator(k));
    this.attrIndicatorKeys = [];
    for (const { id, params } of parseIndicatorList(this.getAttribute("indicators") ?? "")) {
      try { this.attrIndicatorKeys.push(c.addIndicator(id, params)); } catch (e) { console.warn(`<trade-chart>: ${(e as Error).message}`); }
    }
  }

  private rememberTheme(t: ThemeInput): void {
    if (t === "dark" || t === "light") { this.themeJs = null; this.themeBase = t; return; }
    this.themeBase = t.base ?? this.themeBase;
    this.themeJs = mergeDeep(this.themeJs ?? {}, t);
  }

  /** Preset (theme attribute, or base from JavaScript) ← CSS variables ← colours set in JavaScript. */
  private applyTheme(): void {
    const attr = this.getAttribute("theme");
    const base = attr === "light" || attr === "dark" ? attr : this.themeBase ?? "dark";
    this.setFallbackColours();
    const { base: _b, ...js } = this.themeJs ?? {};
    void _b;
    this._chart?.setTheme({ ...resolveTheme(base === "light" ? LIGHT : DARK, getComputedStyle(this)), ...js });
  }

  /** Colours for the HTML buttons when no CSS variables are set. */
  private setFallbackColours(): void {
    const attr = this.getAttribute("theme");
    const t = (attr === "light" || (attr !== "dark" && this.themeBase === "light")) ? LIGHT : DARK;
    const js = this.themeJs ?? {};
    this.style.setProperty("--_bg", js.background ?? t.background);
    this.style.setProperty("--_fg", js.textStrong ?? t.textStrong);
    this.style.setProperty("--_line", js.axisLine ?? t.axisLine);
    this.style.setProperty("--_accent", js.accent ?? t.accent);
  }

  private bindUi(): void {
    const c = this._chart!, root = this.root;
    root.querySelector(".controls")!.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-a]")?.dataset.a;
      if (a === "in") c.zoomIn(); else if (a === "out") c.zoomOut(); else if (a === "live") c.goLive();
      else if (a === "image") void c.downloadImage();
      else if (a === "fullscreen") void this.toggleFullscreen();
      else if (a === "rotate") void this.rotate();
    });
    // leaving the browser's full screen with Esc or a gesture
    const onNativeChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      const current = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      if (this.isFullscreen && !this.fakeFullscreen && current !== this) {
        this.toggleAttribute("fullscreen", false);
        this.locked = false;
        this.updateRotation();
        this.fullscreenChanged();
      }
    };
    window.addEventListener("resize", () => this.updateRotation());
    document.addEventListener("fullscreenchange", onNativeChange);
    document.addEventListener("webkitfullscreenchange", onNativeChange);
    // F toggles full screen; Esc leaves the page-covering mode
    this.addEventListener("keydown", (e) => {
      if (!c.options.interaction.keyboard || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key === "f" || e.key === "F") && c.options.ui.fullscreenButton) { e.preventDefault(); void this.toggleFullscreen(); }
      else if (e.key === "Escape" && this.fakeFullscreen && !c.drawingTool && !c.selectedDrawing) void this.exitFullscreen();
    });
    this.liveBtn.addEventListener("click", () => c.goLive());
    const ranges = root.querySelector<HTMLElement>(".ranges")!;
    ranges.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-range]");
      if (!b) return;
      try { c.zoomTo(b.dataset.range!); } catch (err) { console.warn(`Tickline: ${(err as Error).message}`); return; }
      ranges.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    });
    // the highlighted range no longer applies once the user zooms or scrolls away
    const clearRange = () => ranges.querySelectorAll('[aria-pressed="true"]').forEach((x) => x.setAttribute("aria-pressed", "false"));
    c.canvas.addEventListener("wheel", clearRange, { passive: true });
    c.canvas.addEventListener("pointerdown", clearRange);
    root.querySelector(".controls")!.addEventListener("click", clearRange);
    const tools = root.querySelector<HTMLElement>(".tools")!;
    tools.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const toggle = target.closest<HTMLButtonElement>(".toggle");
      if (toggle) { const open = tools.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open)); return; }
      const t = target.closest<HTMLButtonElement>("[data-tool]")?.dataset.tool as DrawingTool | undefined;
      if (!t) return;
      c.setDrawingTool(c.drawingTool === t ? null : t);
      tools.classList.remove("open");
      tools.querySelector(".toggle")!.setAttribute("aria-expanded", "false");
      c.canvas.focus({ preventScroll: true });
    });
    root.querySelector(".selbar")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b) return;
      const d = c.selectedDrawing;
      if (b.hasAttribute("data-del")) { if (d && !d.locked) c.removeDrawing(d.id); return; }
      if (b.hasAttribute("data-dup")) { if (d) c.duplicateDrawing(d.id); return; }
      if (b.hasAttribute("data-lock")) { if (d) { c.updateDrawing(d.id, { locked: !d.locked }); this.markSelection(); } return; }
      const color = b.dataset.color;
      if (!color) return;
      c.drawingColor = color;
      if (d) c.updateDrawing(d.id, { color });
      this.markSwatches(color);
    });
    c.on("toolchange", (t) => root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t))));
    c.on("drawingcreate", (d) => { if (d.tool === "text") this.openTextEditor(d.id, true); });
    c.canvas.addEventListener("dblclick", () => {
      const d = c.selectedDrawing;
      if (d?.tool === "text" && !d.locked && c.options.interaction.editDrawings) this.openTextEditor(d.id, false);
    });
    c.on("drawingselect", (d) => {
      root.querySelector(".selbar")!.classList.toggle("show", !!d && c.options.ui.drawingBar);
      this.markSwatches(d?.color ?? null);
      this.markSelection();
    });
    c.on("followchange", ({ following }) => { this.following = following; this.liveBtn.classList.toggle("show", !following && c.options.ui.liveButton); });
    c.on("zoomlimit", ({ minCandles }) => {
      const o = c.options;
      if (o.ui.zoomLimitMessage) this.showToast(o.labels.zoomLimit.replace("{n}", String(minCandles)));
    });
  }

  private editor: HTMLInputElement | null = null;
  /** A text box over a text drawing; Enter or leaving it saves, Esc cancels (and removes a new, empty one). */
  private openTextEditor(id: string, isNew: boolean): void {
    const c = this._chart;
    const d = c?.drawings.find((x) => x.id === id);
    if (!c || !d) return;
    this.editor?.remove();
    const input = document.createElement("input");
    input.className = "texted";
    input.setAttribute("part", "text-editor");
    input.value = d.text ?? "";
    input.placeholder = c.options.labels.textPlaceholder;
    input.setAttribute("aria-label", c.options.labels.editText);
    const at = c.toScreen(d.points[0]);
    input.style.left = `${Math.max(4, Math.min(at.x - 4, this.wrap.clientWidth - 140))}px`;
    input.style.top = `${Math.max(4, at.y - 16)}px`;
    this.wrap.append(input);
    this.editor = input;
    let done = false;
    const close = (save: boolean) => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      input.remove();
      if (this.editor === input) this.editor = null;
      if (save && text) c.updateDrawing(id, { text });
      else if (isNew && !text) c.removeDrawing(id);
      c.canvas.focus({ preventScroll: true });
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") close(true);
      else if (e.key === "Escape") close(false);
    });
    input.addEventListener("blur", () => close(true));
    requestAnimationFrame(() => input.focus());
  }

  /** Lock button state and Delete availability for the selected drawing. */
  private markSelection(): void {
    const c = this._chart;
    if (!c) return;
    const d = c.selectedDrawing, L = c.options.labels;
    const lock = this.root.querySelector<HTMLButtonElement>("[data-lock]")!;
    lock.textContent = d?.locked ? L.unlock : L.lock;
    lock.setAttribute("aria-pressed", String(!!d?.locked));
    this.root.querySelector<HTMLButtonElement>("[data-del]")!.disabled = !!d?.locked;
  }

  private markSwatches(color: string | null): void {
    this.root.querySelectorAll<HTMLButtonElement>(".swatch").forEach((sw) => sw.setAttribute("aria-pressed", String(sw.dataset.color === color)));
  }

  /** Shows, hides and labels the HTML controls from the current settings. */
  private applyUi(): void {
    const c = this._chart;
    if (!c) return;
    const { ui, labels: L, drawings } = c.options;
    const root = this.root;
    const controls = root.querySelector<HTMLElement>(".controls")!;
    controls.setAttribute("aria-label", `${L.zoomIn} / ${L.zoomOut}`);
    const label = (sel: string, text: string, key = "") => {
      const b = root.querySelector<HTMLElement>(sel)!;
      b.setAttribute("aria-label", text);
      b.title = key ? `${text} (${key})` : text;
    };
    label('.controls [data-a="out"]', L.zoomOut, "−");
    label('.controls [data-a="live"]', L.backToLive, "End");
    label('.controls [data-a="in"]', L.zoomIn, "+");
    label('.controls [data-a="image"]', L.screenshot);
    root.querySelector('.controls [data-a="image"]')!.classList.toggle("off", !ui.screenshotButton);
    root.querySelector('.controls [data-a="fullscreen"]')!.classList.toggle("off", !ui.fullscreenButton);
    root.querySelector('.controls [data-a="rotate"]')!.classList.toggle("off", !ui.fullscreenButton || !ui.rotateButton);
    label('.controls [data-a="rotate"]', L.rotate);
    root.querySelector(".controls .sep")!.classList.toggle("off", !ui.screenshotButton && !ui.fullscreenButton);
    label('.controls [data-a="fullscreen"]', this.isFullscreen ? L.exitFullscreen : L.fullscreen, "F");
    // the bar is shown when any of its buttons are
    controls.classList.toggle("off", !ui.zoomButtons && !ui.screenshotButton && !ui.fullscreenButton);
    controls.querySelectorAll<HTMLElement>('[data-a="out"], [data-a="live"], [data-a="in"]').forEach((b) => b.classList.toggle("off", !ui.zoomButtons));
    this.wrap.classList.toggle("ctl-always", ui.controlsVisible === "always");
    this.wrap.classList.toggle("ctl-auto", ui.controlsVisible === "auto");
    const ranges = root.querySelector<HTMLElement>(".ranges")!;
    const rangeHtml = ui.ranges.map((r) => `<button type="button" data-range="${esc(r)}" aria-label="${esc(`${L.showRange} ${r}`)}">${esc(r)}</button>`).join("");
    if (ranges.innerHTML !== rangeHtml) ranges.innerHTML = rangeHtml;
    ranges.setAttribute("aria-label", L.showRange);
    ranges.classList.toggle("off", !ui.rangeButtons || ui.ranges.length === 0);
    this.wrap.classList.toggle("ranged", ui.rangeButtons && ui.ranges.length > 0);
    this.liveBtn.textContent = L.live;
    this.liveBtn.setAttribute("aria-label", L.backToLive);
    this.liveBtn.classList.toggle("show", !this.following && ui.liveButton);

    const tools = root.querySelector<HTMLElement>(".tools")!;
    const list = ui.drawingTools.filter((t) => t in ICONS);
    tools.classList.toggle("off", !ui.drawingToolbar || list.length === 0);
    this.wrap.classList.toggle("tooled", ui.drawingToolbar && list.length > 0);
    tools.setAttribute("aria-label", L.drawingTools);
    const toggle = tools.querySelector<HTMLElement>(".toggle")!;
    toggle.setAttribute("aria-label", L.drawingTools);
    toggle.title = L.drawingTools;
    const html = list.map((t) => `<button type="button" data-tool="${t}" aria-pressed="${c.drawingTool === t}" aria-label="${esc(L.tools[t])}" title="${esc(L.tools[t])}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[t]}</svg></button>`).join("");
    const listEl = tools.querySelector<HTMLElement>(".list")!;
    if (listEl.innerHTML !== html) listEl.innerHTML = html; // rebuild only when the tools or their names change

    const bar = root.querySelector<HTMLElement>(".selbar")!;
    bar.setAttribute("aria-label", L.selectedDrawing);
    if (!ui.drawingBar) bar.classList.remove("show");
    const swatches = root.querySelector(".swatches")!;
    const sw = drawings.colors.map((col) =>
      `<button type="button" class="swatch" data-color="${esc(col)}" style="background:${esc(col)}" aria-label="${esc(L.color)} ${esc(col)}" aria-pressed="false"></button>`).join("");
    if (swatches.innerHTML !== sw) swatches.innerHTML = sw;
    this.markSwatches(c.selectedDrawing?.color ?? null);
    const del = root.querySelector<HTMLElement>("[data-del]")!;
    del.textContent = L.delete;
    del.setAttribute("aria-label", L.deleteDrawing);
    del.title = `${L.deleteDrawing} (Del)`;
    root.querySelector<HTMLElement>("[data-dup]")!.textContent = L.duplicate;
    this.markSelection();
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 2600);
  }
}

/** Registers <trade-chart> (safe to call more than once). */
export function defineTradeChart(tag = "trade-chart"): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, class extends TradeChartElement {});
}

declare global {
  interface HTMLElementTagNameMap { "trade-chart": TradeChartElement }
}
