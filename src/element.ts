// <trade-chart>: the chart as a custom element, usable from plain HTML or any framework.
import { Chart, type ChartEvents, type IndicatorStyle } from "./chart";
import { DARK, LIGHT, resolveTheme } from "./theme";
import { parseIndicatorList } from "./indicators";
import { POINTS_NEEDED, type Drawing, type DrawingTool } from "./drawings";
import { applyOptions, defaultOptions, mergeDeep, type ChartOptions, type ResolvedOptions, type ThemeInput } from "./options";
import type { Candle, ChartType, MarkerOptions, PriceLineOptions, Theme, Tick, TimeLineOptions, ZoneOptions } from "./types";

/** Attributes and the setting each one controls. Removing an attribute restores that setting's default. */
const ATTRS = [
  "type", "timeframe", "theme", "symbol", "precision", "timezone", "locale", "fps", "font-size",
  "countdown", "price-line", "right-padding", "min-visible-candles", "emphasis-digits", "animate",
  "crosshair", "grid", "legend", "controls", "drawing-tools", "indicators", "options",
] as const;
type Attr = (typeof ATTRS)[number];

const STYLE = `
:host { display: block; position: relative; height: 420px; min-height: 160px; contain: content; }
.wrap { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
.controls { position: absolute; left: 50%; bottom: 36px; transform: translateX(-50%); display: flex; gap: 4px;
  opacity: 0; transition: opacity .2s; pointer-events: none; }
.wrap:hover .controls, .controls:focus-within { opacity: 1; pointer-events: auto; }
button { font: 600 13px/1 var(--tl-font, system-ui, sans-serif); min-width: 30px; height: 28px; padding: 0 9px; border-radius: 7px; cursor: pointer;
  color: var(--tl-text-strong, var(--_fg)); background: color-mix(in srgb, var(--tl-background, var(--_bg)) 80%, transparent);
  border: 1px solid var(--tl-axis-line, var(--_line)); backdrop-filter: blur(6px); }
button:hover { border-color: var(--tl-accent, var(--_accent)); }
button:focus-visible { outline: 2px solid var(--tl-accent, var(--_accent)); outline-offset: 1px; }
.live { position: absolute; right: 76px; bottom: 36px; display: none; color: var(--tl-accent-text, #fff);
  background: var(--tl-accent, var(--_accent)); border-color: transparent; }
.live.show { display: inline-flex; align-items: center; gap: 6px; }
.toast { position: absolute; left: 50%; top: 44px; transform: translate(-50%, -6px); padding: 7px 12px; border-radius: 8px;
  font: 500 12px var(--tl-font, system-ui, sans-serif); color: var(--tl-toast-text, #fff); background: var(--tl-toast-background, rgba(15, 18, 26, .92));
  opacity: 0; transition: opacity .2s, transform .2s; pointer-events: none; white-space: nowrap; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.tools { position: absolute; left: 8px; top: 58px; display: flex; flex-direction: column; gap: 4px; }
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
.off { display: none !important; }
@media (max-width: 420px) { .tools { top: auto; bottom: 36px; flex-direction: row; } }
@media (prefers-reduced-motion: reduce) { .controls, .toast { transition: none; } }
`;

const ICONS: Record<DrawingTool, string> = {
  line: '<path d="M3 13L13 3"/><circle cx="3" cy="13" r="1.4"/><circle cx="13" cy="3" r="1.4"/>',
  trend: '<path d="M2 14L14 4"/><circle cx="5" cy="11.5" r="1.4"/>',
  horizontal: '<path d="M2 8h12"/><circle cx="8" cy="8" r="1.4"/>',
  vertical: '<path d="M8 2v12"/><circle cx="8" cy="8" r="1.4"/>',
  fib: '<path d="M2 3h12M2 6.5h12M2 9.5h12M2 13h12" stroke-dasharray="0"/><path d="M3 13L13 3" stroke-dasharray="1.5 2"/>',
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
    case "crosshair": return { crosshair: { mode: v === "free" || v === "hidden" ? v : v === "false" || v === "none" ? "hidden" : "snap" } };
    case "grid": {
      const g = (v ?? "both").trim().toLowerCase();
      return { grid: { horizontal: ["both", "true", "horizontal", ""].includes(g), vertical: ["both", "true", "vertical", ""].includes(g) } };
    }
    case "legend": return { legend: { visible: bool(v, true) } };
    case "controls": {
      const on = v === null || v.trim().toLowerCase() !== "none";
      return { ui: { zoomButtons: on, liveButton: on, drawingToolbar: on, drawingBar: on } };
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
export class TradeChartElement extends HTMLElement {
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
      </div>
      <button type="button" class="live" part="live-button" data-a="live"></button>
      <div class="tools" part="drawing-tools" role="toolbar"></div>
      <div class="selbar" part="drawing-bar" role="toolbar"><span class="swatches" style="display:contents"></span>
        <button type="button" class="del" data-del></button></div>
      <div class="toast" part="toast" role="status" aria-live="polite"></div>`;
    this.wrap = this.root.querySelector(".wrap")!;
    this.wrap.append(...["controls", "live", "toast", "tools", "selbar"].map((c) => this.root.querySelector("." + c)!));
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
    this.applyTheme();
    this.bindUi();

    const forward = <K extends keyof ChartEvents>(type: K) =>
      this._chart!.on(type, (detail) => this.dispatchEvent(new CustomEvent(`tl-${type}`, { detail, bubbles: true, composed: true })));
    (["crosshair", "rangechange", "requesthistory", "zoomlimit", "followchange", "click", "indicatorschange", "drawingschange", "drawingselect", "toolchange"] as const).forEach(forward);
    this.applyIndicatorAttribute();
    this.applyUi();

    const queued = this.pending; this.pending = [];
    queued.forEach((f) => f());
  }

  disconnectedCallback(): void {
    // Keep the chart if the element is just being moved in the DOM.
    queueMicrotask(() => { if (!this.isConnected) { this._chart?.destroy(); this._chart = null; } });
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
  updateOverlay(id: string, patch: Parameters<Chart["updateOverlay"]>[1]): void { this.run((c) => c.updateOverlay(id, patch)); }
  removeOverlay(id: string): void { this.run((c) => c.removeOverlay(id)); }
  clearOverlays(): void { this.run((c) => c.clearOverlays()); }
  /** Adds an indicator ("sma", "ema", "bb", "rsi", "macd", "volume" or one you registered). Returns its key. */
  addIndicator(id: string, params?: Record<string, number> | number[], style?: IndicatorStyle): string { return this.runId((c) => c.addIndicator(id, params, style)); }
  updateIndicator(key: string, params?: Record<string, number> | number[], style?: IndicatorStyle): void { this.run((c) => c.updateIndicator(key, params, style)); }
  removeIndicator(key: string): void { this.run((c) => c.removeIndicator(key)); }
  clearIndicators(): void { this.attrIndicatorKeys = []; this.run((c) => c.clearIndicators()); }
  get indicatorList() { return this._chart?.indicatorList ?? []; }
  /** Starts placing a drawing ("line", "trend", "horizontal", "vertical", "fib"), or stops with null. */
  setDrawingTool(tool: DrawingTool | null): void { this.run((c) => c.setDrawingTool(tool)); }
  /** All drawings as plain data (store it as JSON to restore later with setDrawings). */
  get drawings(): Drawing[] { return this._chart?.drawings ?? []; }
  set drawings(list: readonly Drawing[]) { this.setDrawings(list); }
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
    });
    this.liveBtn.addEventListener("click", () => c.goLive());
    root.querySelector(".tools")!.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tool]")?.dataset.tool as DrawingTool | undefined;
      if (!t) return;
      c.setDrawingTool(c.drawingTool === t ? null : t);
      c.canvas.focus({ preventScroll: true });
    });
    root.querySelector(".selbar")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b) return;
      const d = c.selectedDrawing;
      if (b.hasAttribute("data-del")) { if (d) c.removeDrawing(d.id); return; }
      const color = b.dataset.color;
      if (!color) return;
      c.drawingColor = color;
      if (d) c.updateDrawing(d.id, { color });
      this.markSwatches(color);
    });
    c.on("toolchange", (t) => root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t))));
    c.on("drawingselect", (d) => {
      root.querySelector(".selbar")!.classList.toggle("show", !!d && c.options.ui.drawingBar);
      this.markSwatches(d?.color ?? null);
    });
    c.on("followchange", ({ following }) => { this.following = following; this.liveBtn.classList.toggle("show", !following && c.options.ui.liveButton); });
    c.on("zoomlimit", ({ minCandles }) => {
      const o = c.options;
      if (o.ui.zoomLimitMessage) this.showToast(o.labels.zoomLimit.replace("{n}", String(minCandles)));
    });
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
    controls.classList.toggle("off", !ui.zoomButtons);
    controls.setAttribute("aria-label", `${L.zoomIn} / ${L.zoomOut}`);
    const label = (sel: string, text: string, key = "") => {
      const b = root.querySelector<HTMLElement>(sel)!;
      b.setAttribute("aria-label", text);
      b.title = key ? `${text} (${key})` : text;
    };
    label('.controls [data-a="out"]', L.zoomOut, "−");
    label('.controls [data-a="live"]', L.backToLive, "End");
    label('.controls [data-a="in"]', L.zoomIn, "+");
    this.liveBtn.textContent = L.live;
    this.liveBtn.setAttribute("aria-label", L.backToLive);
    this.liveBtn.classList.toggle("show", !this.following && ui.liveButton);

    const tools = root.querySelector<HTMLElement>(".tools")!;
    const list = ui.drawingTools.filter((t) => t in ICONS);
    tools.classList.toggle("off", !ui.drawingToolbar || list.length === 0);
    tools.setAttribute("aria-label", L.drawingTools);
    const html = list.map((t) => `<button type="button" data-tool="${t}" aria-pressed="${c.drawingTool === t}" aria-label="${esc(L.tools[t])}" title="${esc(L.tools[t])}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[t]}</svg></button>`).join("");
    if (tools.innerHTML !== html) tools.innerHTML = html; // rebuild only when the tools or their names change

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
