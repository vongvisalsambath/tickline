// <trade-chart>: the chart as a custom element, usable from plain HTML or any framework.
import { Chart, type ChartEvents, type ChartOptions } from "./chart";
import { DARK, LIGHT, resolveTheme } from "./theme";
import type { Candle, ChartType, MarkerOptions, PriceLineOptions, Tick, TimeLineOptions, ZoneOptions } from "./types";

const ATTRS = ["type", "timeframe", "theme", "precision", "symbol", "fps", "countdown", "price-line", "timezone", "right-padding", "controls"] as const;

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
:host([controls="none"]) .controls, :host([controls="none"]) .live { display: none !important; }
@media (prefers-reduced-motion: reduce) { .controls, .toast { transition: none; } }
`;

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
      <div class="toast" role="status" aria-live="polite"></div>`;
    this.wrap = root.querySelector(".wrap")!;
    this.wrap.append(root.querySelector(".controls")!, root.querySelector(".live")!, root.querySelector(".toast")!);
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
    (["crosshair", "rangechange", "requesthistory", "zoomlimit", "followchange", "click"] as const).forEach(forward);
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
