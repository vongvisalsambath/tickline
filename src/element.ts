// <trade-chart>: the chart as a custom element, usable from plain HTML or any framework.
import { Chart, type ChartEvents, type ChartOptions } from "./chart";
import { DARK, LIGHT, resolveTheme } from "./theme";
import { parseIndicatorList } from "./indicators";
import { TOOL_NAMES, type Drawing, type DrawingTool } from "./drawings";
import type { Candle, ChartType, MarkerOptions, PriceLineOptions, Tick, TimeLineOptions, ZoneOptions } from "./types";

const ATTRS = ["type", "timeframe", "theme", "precision", "symbol", "fps", "countdown", "price-line", "timezone", "right-padding", "controls", "indicators", "drawing-tools"] as const;

const STYLE = `
:host { display: block; position: relative; height: 420px; min-height: 160px; contain: content; }
.wrap { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
.controls { position: absolute; left: 50%; bottom: 36px; transform: translateX(-50%); display: flex; gap: 4px;
  opacity: 0; transition: opacity .2s; pointer-events: none; }
.wrap:hover .controls, .controls:focus-within { opacity: 1; pointer-events: auto; }
button { font: 600 13px/1 system-ui, sans-serif; min-width: 30px; height: 28px; padding: 0 9px; border-radius: 7px; cursor: pointer;
  color: var(--tl-text-strong, var(--_fg)); background: color-mix(in srgb, var(--tl-background, var(--_bg)) 80%, transparent);
  border: 1px solid var(--tl-axis-line, var(--_line)); backdrop-filter: blur(6px); }
button:hover { border-color: var(--tl-accent, var(--_accent)); }
button:focus-visible { outline: 2px solid var(--tl-accent, var(--_accent)); outline-offset: 1px; }
.live { position: absolute; right: 76px; bottom: 36px; display: none; color: var(--tl-accent-text, #fff);
  background: var(--tl-accent, var(--_accent)); border-color: transparent; }
.live.show { display: inline-flex; align-items: center; gap: 6px; }
.toast { position: absolute; left: 50%; top: 44px; transform: translate(-50%, -6px); padding: 7px 12px; border-radius: 8px;
  font: 500 12px system-ui, sans-serif; color: #fff; background: rgba(15, 18, 26, .92); opacity: 0; transition: opacity .2s, transform .2s;
  pointer-events: none; white-space: nowrap; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.tools { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 4px; }
.tools button { width: 30px; min-width: 0; padding: 0; display: grid; place-items: center; opacity: .8; }
.tools button:hover, .tools button[aria-pressed="true"] { opacity: 1; }
.tools button[aria-pressed="true"] { color: var(--tl-accent-text, #fff); background: var(--tl-accent, var(--_accent)); border-color: transparent; }
.tools svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
.selbar { position: absolute; left: 50%; top: 52px; transform: translateX(-50%); display: none; gap: 6px; align-items: center; padding: 5px 6px;
  border-radius: 9px; background: color-mix(in srgb, var(--tl-background, var(--_bg)) 88%, transparent);
  border: 1px solid var(--tl-axis-line, var(--_line)); backdrop-filter: blur(6px); }
.selbar.show { display: flex; }
.swatch { width: 18px; min-width: 0; height: 18px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
.swatch[aria-pressed="true"] { border-color: var(--tl-text-strong, var(--_fg)); }
.selbar .del { height: 24px; font-weight: 600; font-size: 12px; }
:host([controls="none"]) .controls, :host([controls="none"]) .live, :host([controls="none"]) .tools,
:host([drawing-tools="false"]) .tools { display: none !important; }
@media (max-width: 420px) { .tools { top: auto; bottom: 36px; transform: none; flex-direction: row; } }
@media (prefers-reduced-motion: reduce) { .controls, .toast { transition: none; } }
`;

const ICONS: Record<DrawingTool, string> = {
  line: '<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1.4"/><circle cx="13" cy="3" r="1.4"/>',
  trend: '<path d="M2 14L14 4"/><circle cx="5" cy="11.5" r="1.4"/>',
  horizontal: '<path d="M2 8h12"/><circle cx="8" cy="8" r="1.4"/>',
  vertical: '<path d="M8 2v12"/><circle cx="8" cy="8" r="1.4"/>',
  fib: '<path d="M2 3h12M2 6.5h12M2 9.5h12M2 13h12" stroke-dasharray="0"/><path d="M3 13L13 3" stroke-dasharray="1.5 2"/>',
};
const TOOL_BUTTONS = (Object.keys(ICONS) as DrawingTool[]).map((t) =>
  `<button type="button" data-tool="${t}" aria-pressed="false" aria-label="${TOOL_NAMES[t]}" title="${TOOL_NAMES[t]}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[t]}</svg></button>`).join("");
const COLORS = ["#4c9aff", "#22c38e", "#f0506e", "#f5a524", "#a78bfa", "#e6e9ef"];
const SWATCHES = COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="Colour ${c}" aria-pressed="false"></button>`).join("");

/**
 * <trade-chart type="candles" timeframe="1m" theme="dark" symbol="BTC/USDT"></trade-chart>
 *
 * Methods: setData, prependData, tick, update, addMarker, addPriceLine, addTimeLine, addZone, updateOverlay,
 * removeOverlay, clearOverlays, zoomIn, zoomOut, goLive, fitContent. Events (DOM, bubbling): tl-crosshair,
 * tl-rangechange, tl-requesthistory, tl-zoomlimit, tl-followchange, tl-click.
 */
export class TradeChartElement extends HTMLElement {
  static get observedAttributes(): readonly string[] { return ATTRS; }

  private _chart: Chart | null = null;
  private wrap!: HTMLDivElement;
  private liveBtn!: HTMLButtonElement;
  private toast!: HTMLDivElement;
  private toastTimer = 0;
  private pending: (() => void)[] = [];

  /** The underlying engine (available after the element is connected). */
  get chart(): Chart | null { return this._chart; }

  connectedCallback(): void {
    if (this._chart) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style><div class="wrap" part="chart"></div>
      <div class="controls" part="controls" role="toolbar" aria-label="Chart zoom">
        <button type="button" data-a="out" aria-label="Zoom out" title="Zoom out (−)">−</button>
        <button type="button" data-a="live" aria-label="Back to live" title="Back to live (End)">⌖</button>
        <button type="button" data-a="in" aria-label="Zoom in" title="Zoom in (+)">+</button>
      </div>
      <button type="button" class="live" part="live-button" data-a="live" aria-label="Back to live">Live ▸</button>
      <div class="tools" part="drawing-tools" role="toolbar" aria-label="Drawing tools">${TOOL_BUTTONS}</div>
      <div class="selbar" part="drawing-bar" role="toolbar" aria-label="Selected drawing">${SWATCHES}
        <button type="button" class="del" data-del aria-label="Delete drawing" title="Delete (Del)">Delete</button></div>
      <div class="toast" role="status" aria-live="polite"></div>`;
    this.wrap = root.querySelector(".wrap")!;
    this.wrap.append(root.querySelector(".controls")!, root.querySelector(".live")!, root.querySelector(".toast")!,
      root.querySelector(".tools")!, root.querySelector(".selbar")!);
    this.liveBtn = root.querySelector(".live")!;
    this.toast = root.querySelector(".toast")!;
    this.setFallbackColours();

    this._chart = new Chart(this.wrap, this.readOptions());
    this.wrap.prepend(this._chart.canvas);
    this.applyTheme();
    root.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.a;
        if (a === "in") this._chart?.zoomIn();
        else if (a === "out") this._chart?.zoomOut();
        else this._chart?.goLive();
      }));

    const forward = <K extends keyof ChartEvents>(type: K) =>
      this._chart!.on(type, (detail) => this.dispatchEvent(new CustomEvent(`tl-${type}`, { detail, bubbles: true, composed: true })));
    (["crosshair", "rangechange", "requesthistory", "zoomlimit", "followchange", "click", "indicatorschange", "drawingschange", "drawingselect", "toolchange"] as const).forEach(forward);
    this.bindDrawingUi(root);
    this.applyIndicatorAttribute();
    this._chart.on("followchange", ({ following }) => this.liveBtn.classList.toggle("show", !following));
    this._chart.on("zoomlimit", ({ minCandles }) => this.showToast(`You're at the closest zoom (${minCandles} candles). Pick a smaller timeframe to see more detail.`));

    const queued = this.pending; this.pending = [];
    queued.forEach((f) => f());
  }

  disconnectedCallback(): void {
    // Keep the chart if the element is just being moved in the DOM.
    queueMicrotask(() => { if (!this.isConnected) { this._chart?.destroy(); this._chart = null; } });
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this._chart) return;
    if (name === "theme") { this.applyTheme(); return; }
    if (name === "controls") return;
    if (name === "indicators") { this.applyIndicatorAttribute(); return; }
    this._chart.setOptions(this.readOptions());
    void value;
  }

  // ---------------------------------------------------------------- properties mirroring attributes

  get type(): ChartType { return (this.getAttribute("type") as ChartType) || "candles"; }
  set type(v: ChartType) { this.setAttribute("type", v); }
  get timeframe(): string { return this.getAttribute("timeframe") || "1m"; }
  set timeframe(v: string) { this.setAttribute("timeframe", v); }

  // ---------------------------------------------------------------- methods (queued until connected)

  setData(candles: readonly Candle[]): void { this.run((c) => c.setData(candles)); }
  prependData(candles: readonly Candle[]): void { this.run((c) => c.prependData(candles)); }
  tick(t: Tick): void { this.run((c) => c.tick(t)); }
  update(candle: Candle): void { this.run((c) => c.update(candle)); }
  addMarker(o: MarkerOptions): string { return this.runId((c) => c.addMarker(o)); }
  addPriceLine(o: PriceLineOptions): string { return this.runId((c) => c.addPriceLine(o)); }
  addTimeLine(o: TimeLineOptions): string { return this.runId((c) => c.addTimeLine(o)); }
  addZone(o: ZoneOptions): string { return this.runId((c) => c.addZone(o)); }
  updateOverlay(id: string, patch: Parameters<Chart["updateOverlay"]>[1]): void { this.run((c) => c.updateOverlay(id, patch)); }
  removeOverlay(id: string): void { this.run((c) => c.removeOverlay(id)); }
  clearOverlays(): void { this.run((c) => c.clearOverlays()); }
  /** Adds an indicator ("sma", "ema", "bb", "rsi", "macd", "volume" or one you registered). Returns its key. */
  addIndicator(id: string, params?: Record<string, number> | number[]): string { return this.runId((c) => c.addIndicator(id, params)); }
  updateIndicator(key: string, params: Record<string, number> | number[]): void { this.run((c) => c.updateIndicator(key, params)); }
  removeIndicator(key: string): void { this.run((c) => c.removeIndicator(key)); }
  get indicatorList() { return this._chart?.indicatorList ?? []; }
  /** Starts placing a drawing ("line", "trend", "horizontal", "vertical", "fib"), or stops with null. */
  setDrawingTool(tool: DrawingTool | null): void { this.run((c) => c.setDrawingTool(tool)); }
  /** All drawings as plain data (store it as JSON to restore later with setDrawings). */
  get drawings(): Drawing[] { return this._chart?.drawings ?? []; }
  setDrawings(list: readonly Drawing[]): void { this.run((c) => c.setDrawings(list)); }
  addDrawing(d: Parameters<Chart["addDrawing"]>[0]): string { return this.runId((c) => c.addDrawing(d)); }
  updateDrawing(id: string, patch: Parameters<Chart["updateDrawing"]>[1]): void { this.run((c) => c.updateDrawing(id, patch)); }
  removeDrawing(id: string): void { this.run((c) => c.removeDrawing(id)); }
  clearDrawings(): void { this.run((c) => c.clearDrawings()); }
  zoomIn(): void { this._chart?.zoomIn(); }
  zoomOut(): void { this._chart?.zoomOut(); }
  goLive(): void { this._chart?.goLive(); }
  fitContent(): void { this._chart?.fitContent(); }

  private run(f: (c: Chart) => void): void {
    if (this._chart) f(this._chart); else this.pending.push(() => f(this._chart!));
  }
  private runId(f: (c: Chart) => string): string {
    if (this._chart) return f(this._chart);
    throw new Error("<trade-chart> must be in the document before adding overlays.");
  }

  // ---------------------------------------------------------------- helpers

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

  private readOptions(): ChartOptions {
    const a = (n: string) => this.getAttribute(n);
    const num = (n: string) => (a(n) !== null && a(n) !== "" && !Number.isNaN(Number(a(n))) ? Number(a(n)) : undefined);
    const tz = a("timezone");
    return {
      type: (a("type") as ChartType) || undefined,
      timeframe: a("timeframe") || undefined,
      symbol: a("symbol") ?? undefined,
      precision: num("precision") ?? "auto",
      fps: num("fps"),
      countdown: a("countdown") === null ? undefined : a("countdown") !== "false",
      priceLine: (a("price-line") as ChartOptions["priceLine"]) || undefined,
      timezone: tz === null || tz === "local" ? "local" : Number(tz),
      rightPadding: num("right-padding"),
    };
  }

  private applyTheme(): void {
    const preset = this.getAttribute("theme") === "light" ? LIGHT : DARK;
    this.setFallbackColours();
    this._chart?.setTheme(resolveTheme(preset, getComputedStyle(this)));
  }

  /** Colours for the HTML buttons when no CSS variables are set. */
  private setFallbackColours(): void {
    const t = this.getAttribute("theme") === "light" ? LIGHT : DARK;
    this.style.setProperty("--_bg", t.background);
    this.style.setProperty("--_fg", t.textStrong);
    this.style.setProperty("--_line", t.axisLine);
    this.style.setProperty("--_accent", t.accent);
  }

  private bindDrawingUi(root: ShadowRoot): void {
    const c = this._chart!;
    const toolBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-tool]")];
    toolBtns.forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.tool as DrawingTool;
      c.setDrawingTool(c.drawingTool === t ? null : t);
      c.canvas.focus({ preventScroll: true });
    }));
    c.on("toolchange", (t) => toolBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t))));
    const bar = root.querySelector<HTMLDivElement>(".selbar")!;
    const swatches = [...root.querySelectorAll<HTMLButtonElement>(".swatch")];
    c.on("drawingselect", (d) => {
      bar.classList.toggle("show", !!d);
      swatches.forEach((sw) => sw.setAttribute("aria-pressed", String(!!d && sw.dataset.color === d.color)));
    });
    swatches.forEach((sw) => sw.addEventListener("click", () => {
      const d = c.selectedDrawing;
      c.drawingColor = sw.dataset.color!;
      if (d) c.updateDrawing(d.id, { color: sw.dataset.color! });
      swatches.forEach((x) => x.setAttribute("aria-pressed", String(x === sw)));
    }));
    root.querySelector("[data-del]")!.addEventListener("click", () => { const d = c.selectedDrawing; if (d) c.removeDrawing(d.id); });
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
