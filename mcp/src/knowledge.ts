// What the Tickline MCP server knows: the docs, every setting with its default, the indicators,
// a validator for settings objects, and integration snippets. Pure functions, so they're easy to test.
import readme from "../../README.md";
import configuration from "../../docs/configuration.md";
import { applyOptions, defaultOptions, type ChartOptions, type ResolvedOptions } from "../../src/options";
import { listIndicators } from "../../src/indicators";
import { parseTimeframe } from "../../src/time";

declare const __TICKLINE_VERSION__: string;
export const VERSION: string = typeof __TICKLINE_VERSION__ === "string" ? __TICKLINE_VERSION__ : "0.0.0";

// ------------------------------------------------------------------ docs

export interface DocSection { id: string; title: string; source: "readme" | "configuration"; text: string }

const slug = (s: string) => s.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Splits markdown into sections at ## and ### headings (code blocks are left alone). */
export function splitSections(md: string, source: DocSection["source"]): DocSection[] {
  const out: DocSection[] = [];
  let title = source === "readme" ? "Overview" : "Configuration", lines: string[] = [], inCode = false;
  const flush = () => { const text = lines.join("\n").trim(); if (text) out.push({ id: `${source}/${slug(title)}`, title, source, text }); };
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) inCode = !inCode;
    const m = !inCode && /^(##|###) (.+)$/.exec(line);
    if (m) { flush(); title = m[2].trim(); lines = [line]; } else lines.push(line);
  }
  flush();
  return out;
}

export const SECTIONS: DocSection[] = [...splitSections(readme, "readme"), ...splitSections(configuration, "configuration")];
export const DOCS = { readme, configuration };

/** Sections ranked by how well they match the words in `query`. */
export function searchDocs(query: string, limit = 4): DocSection[] {
  const words = query.toLowerCase().split(/[^a-z0-9.-]+/).filter((w) => w.length > 1);
  if (!words.length) return SECTIONS.slice(0, limit);
  const scored = SECTIONS.map((s) => {
    const title = s.title.toLowerCase(), text = s.text.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 6;
      score += Math.min(8, text.split(w).length - 1);
    }
    return { s, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.s);
}

export function getSection(idOrTitle: string): DocSection | undefined {
  const k = idOrTitle.toLowerCase().trim();
  return SECTIONS.find((s) => s.id === k) ?? SECTIONS.find((s) => slug(s.title) === slug(k)) ?? SECTIONS.find((s) => s.id.endsWith("/" + slug(k)));
}

// ------------------------------------------------------------------ settings

export interface OptionInfo { path: string; default: unknown; description: string }

/** Descriptions from the tables in docs/configuration.md, keyed by setting path. */
const DESCRIPTIONS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const line of configuration.split("\n")) {
    const m = /^\| `([a-zA-Z.]+)` \| [^|]* \| (.+) \|$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/`/g, "").trim();
  }
  return out;
})();

const GROUP_ORDER = ["layout", "series", "grid", "priceScale", "timeScale", "crosshair", "legend", "lastPrice", "livePosition", "watermark",
  "interaction", "animation", "history", "drawings", "format", "labels", "ui"] as const;
export const GROUPS = ["general", ...GROUP_ORDER] as const;

/** Every setting in a group ("general" for the top-level ones), with its default and description. */
export function listOptions(group?: string): OptionInfo[] {
  const d = defaultOptions() as unknown as Record<string, unknown>;
  const rows: OptionInfo[] = [];
  const add = (path: string, value: unknown) => rows.push({ path, default: value, description: DESCRIPTIONS[path] ?? "" });
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = `${prefix}.${k}`;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v as Record<string, unknown>, path); else add(path, v);
    }
  };
  const want = (group ?? "").trim();
  if (!want || want === "general") {
    for (const k of ["type", "timeframe", "symbol", "precision", "timezone", "locale", "fps"]) add(k, d[k]);
    add("theme", "dark");
    if (want === "general") return rows;
  }
  for (const g of GROUP_ORDER) {
    if (want && want !== g) continue;
    if (g === "format") { for (const f of ["price", "time", "countdown", "indicator"]) add(`format.${f}`, "(built in)"); continue; }
    walk(d[g] as Record<string, unknown>, g);
  }
  return rows;
}

export interface Problem { path: string; message: string }

const ENUMS: Record<string, readonly unknown[]> = {
  type: ["candles", "hollow", "bars", "heikin-ashi", "line", "area"],
  "crosshair.mode": ["snap", "free", "hidden"],
  "crosshair.style": ["solid", "dashed", "dotted"],
  "drawings.style": ["solid", "dashed", "dotted"],
  "lastPrice.line": ["short", "full", "none"],
  "lastPrice.countdownDirection": ["down", "up"],
  "ui.fullscreenOrientation": ["auto", "landscape", "portrait"],
  priceLine: ["short", "full", "none"],
};
const TOOLS = ["line", "trend", "arrow", "horizontal", "vertical", "rect", "circle", "fib", "measure", "text"];
const MARKERS = ["pulse", "ripple", "radar", "glow", "dot", "none"];
const SHORTHANDS: Record<string, string> = {
  animate: "boolean", countdown: "boolean", priceLine: "string", rightPadding: "number", minVisibleCandles: "number", emphasisDigits: "number",
};
const THEME_KEYS = Object.keys(defaultTheme());

function defaultTheme(): Record<string, string> {
  return {
    background: "", grid: "", text: "", textStrong: "", axisLine: "", up: "", down: "", line: "", areaTop: "", areaBottom: "", accent: "", accentText: "",
    crosshair: "", pillBackground: "", pillText: "", overlayText: "", levelLine: "", font: "", monoFont: "",
  };
}

const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/**
 * Checks a settings object the way the chart reads it: unknown names, wrong types, values the
 * chart doesn't accept, and values it will clamp. Returns the problems and the settings it ends up with.
 */
export function validateOptions(input: unknown): { valid: boolean; problems: Problem[]; warnings: Problem[]; resolved: ResolvedOptions | null } {
  const problems: Problem[] = [], warnings: Problem[] = [];
  if (kind(input) !== "object") return { valid: false, problems: [{ path: "", message: "Settings must be an object, e.g. { grid: { vertical: false } }." }], warnings, resolved: null };
  const o = input as Record<string, unknown>;
  const d = defaultOptions() as unknown as Record<string, unknown>;

  const check = (path: string, value: unknown, def: unknown) => {
    const allowed = ENUMS[path];
    if (allowed && !allowed.includes(value)) { problems.push({ path, message: `Must be one of ${allowed.map((a) => JSON.stringify(a)).join(", ")}.` }); return; }
    if (path === "lastPrice.marker") {
      if (typeof value === "function") return;
      if (!MARKERS.includes(value as string)) problems.push({ path, message: `One of ${MARKERS.map((m) => JSON.stringify(m)).join(", ")}, or a function (from JavaScript).` });
      return;
    }
    if (path === "precision") { if (value !== "auto" && !(typeof value === "number" && value >= 0)) problems.push({ path, message: 'A number of decimals or "auto".' }); return; }
    if (path === "timezone") { if (value !== "local" && typeof value !== "number") problems.push({ path, message: '"local" or minutes from UTC, e.g. 420.' }); return; }
    if (path === "timeframe") { try { parseTimeframe(String(value)); } catch (e) { problems.push({ path, message: (e as Error).message }); } return; }
    if (path === "livePosition.x" || path === "livePosition.y") { if (value !== null && typeof value !== "number") problems.push({ path, message: "A share from 0 to 1, or null." }); return; }
    if (path === "ui.drawingTools") {
      if (!Array.isArray(value)) problems.push({ path, message: `A list of tools: ${TOOLS.join(", ")}.` });
      else value.filter((t) => !TOOLS.includes(t as string)).forEach((t) => problems.push({ path, message: `Unknown tool ${JSON.stringify(t)}. Tools: ${TOOLS.join(", ")}.` }));
      return;
    }
    if (Array.isArray(def)) {
      if (!Array.isArray(value)) problems.push({ path, message: "Must be a list." });
      else if (value.some((x) => kind(x) !== kind(def[0]))) problems.push({ path, message: `Every item must be a ${kind(def[0])}.` });
      return;
    }
    if (kind(def) === "object") {
      if (kind(value) !== "object") { problems.push({ path, message: "Must be an object." }); return; }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const sub = (def as Record<string, unknown>)[k];
        if (sub === undefined) problems.push({ path: `${path}.${k}`, message: `Unknown setting. Known: ${Object.keys(def as object).join(", ")}.` });
        else check(`${path}.${k}`, v, sub);
      }
      return;
    }
    if (kind(value) !== kind(def)) problems.push({ path, message: `Must be a ${kind(def)}, got ${kind(value)}.` });
  };

  for (const [k, v] of Object.entries(o)) {
    if (k === "theme") {
      if (v === "dark" || v === "light") continue;
      if (kind(v) !== "object") { problems.push({ path: k, message: '"dark", "light", or colours such as { base: "light", up: "#16a34a" }.' }); continue; }
      for (const [tk, tv] of Object.entries(v as Record<string, unknown>)) {
        if (tk === "base") { if (tv !== "dark" && tv !== "light") problems.push({ path: "theme.base", message: '"dark" or "light".' }); }
        else if (!THEME_KEYS.includes(tk)) problems.push({ path: `theme.${tk}`, message: `Unknown theme colour. Known: ${THEME_KEYS.join(", ")}.` });
        else if (typeof tv !== "string") problems.push({ path: `theme.${tk}`, message: "Must be a CSS colour (or font) string." });
      }
      continue;
    }
    if (k in SHORTHANDS) {
      if (typeof v !== SHORTHANDS[k]) problems.push({ path: k, message: `Must be a ${SHORTHANDS[k]}.` });
      else if (ENUMS[k] && !ENUMS[k].includes(v)) problems.push({ path: k, message: `Must be one of ${ENUMS[k].join(", ")}.` });
      continue;
    }
    if (k === "format") {
      if (kind(v) !== "object") { problems.push({ path: k, message: "Must be an object of functions." }); continue; }
      for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) {
        if (!["price", "time", "countdown", "indicator"].includes(fk)) problems.push({ path: `format.${fk}`, message: "Unknown formatter. Known: price, time, countdown, indicator." });
        else if (typeof fv !== "function") problems.push({ path: `format.${fk}`, message: "Must be a function; functions can't be written in JSON, so set this from JavaScript." });
      }
      continue;
    }
    if (k === "labels" && kind(v) === "object") {
      const L = d.labels as Record<string, unknown>;
      for (const [lk, lv] of Object.entries(v as Record<string, unknown>)) {
        if (lk === "tools") check("labels.tools", lv, L.tools);
        else if (!(lk in L)) problems.push({ path: `labels.${lk}`, message: `Unknown label. Known: ${Object.keys(L).join(", ")}.` });
        else if (typeof lv !== "string") problems.push({ path: `labels.${lk}`, message: "Must be text." });
      }
      continue;
    }
    if (!(k in d)) { problems.push({ path: k, message: `Unknown setting. Top-level settings: ${[...Object.keys(d), "theme", ...Object.keys(SHORTHANDS)].join(", ")}.` }); continue; }
    check(k, v, d[k]);
  }

  let resolved: ResolvedOptions | null = null;
  if (!problems.length) {
    resolved = applyOptions(defaultOptions(), o as ChartOptions);
    // values the chart keeps in range
    const walk = (given: unknown, got: unknown, path: string) => {
      if (kind(given) === "object" && kind(got) === "object") {
        for (const [k, v] of Object.entries(given as Record<string, unknown>)) walk(v, (got as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      } else if (typeof given === "number" && typeof got === "number" && given !== got) warnings.push({ path, message: `Out of range: the chart will use ${got}.` });
    };
    const { theme: _t, format: _f, ...rest } = o;
    void _t; void _f;
    walk(rest, resolved, "");
  }
  return { valid: problems.length === 0, problems, warnings, resolved };
}

// ------------------------------------------------------------------ indicators

export function indicators() {
  return listIndicators().map((d) => ({
    id: d.id, name: d.name, placement: d.placement,
    params: d.params.map((p) => ({ name: p.name, default: p.default, min: p.min, max: p.max })),
    attribute: `${d.id}${d.params.length ? ":" + d.params.map((p) => p.default).join(":") : ""}`,
  }));
}

// ------------------------------------------------------------------ snippets

export const FRAMEWORKS = ["html", "javascript", "react", "vue", "angular", "svelte", "blazor"] as const;
export type Framework = (typeof FRAMEWORKS)[number];
export const DATA_SOURCES = ["your-api", "binance-demo"] as const;

export interface SnippetInput {
  framework: Framework;
  symbol?: string;
  timeframe?: string;
  type?: string;
  indicators?: string;
  theme?: "dark" | "light";
  height?: number;
  /** Settings to pass to setOptions (JSON-safe). */
  options?: Record<string, unknown>;
  dataSource?: (typeof DATA_SOURCES)[number];
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function js(v: unknown, indent: string): string {
  return JSON.stringify(v, null, 2).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:").split("\n").join("\n" + indent);
}

/** Code that puts a live <trade-chart> in an app, for the given framework and data source. */
export function snippet(input: SnippetInput): { files: { name: string; code: string }[]; notes: string[] } {
  const symbol = input.symbol ?? "BTC/USDT";
  const timeframe = input.timeframe ?? "1m";
  const type = input.type ?? "candles";
  const ind = input.indicators ?? "volume";
  const height = input.height ?? 480;
  const theme = input.theme ?? "dark";
  const demo = (input.dataSource ?? "your-api") === "binance-demo";
  const pair = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const opts = input.options && Object.keys(input.options).length ? input.options : null;
  const tag = (extra = "", close = "></trade-chart>") =>
    `<trade-chart${extra} symbol="${attr(symbol)}" timeframe="${attr(timeframe)}" type="${attr(type)}" theme="${theme}"${ind ? ` indicators="${attr(ind)}"` : ""} style="display: block; height: ${height}px"${close}`;

  // the data part: load history, stream ticks, load older candles on demand
  const historyUrl = demo
    ? `\`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${timeframe}&limit=500\${before ? \`&endTime=\${before - 1}\` : ""}\``
    : `\`/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${timeframe}\${before ? \`&before=\${before}\` : ""}\``;
  const mapCandle = demo ? ".then((rows) => rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] })))" : "";
  const socketUrl = demo ? `"wss://data-stream.binance.vision/ws/${pair.toLowerCase()}@aggTrade"` : `"wss://your-server.example/prices?symbol=${encodeURIComponent(symbol)}"`;
  const onMessage = demo
    ? "const t = JSON.parse(e.data); chart.tick({ time: t.T, price: +t.p, volume: +t.q });"
    : "const { time, price, volume } = JSON.parse(e.data); chart.tick({ time, price, volume });";
  const dataFns = (i: string) => [
    `${i}const candles = (before) => fetch(${historyUrl}).then((r) => r.json())${mapCandle};`,
  ].join("\n");
  const notes: string[] = [];
  if (!demo) notes.push("Replace /api/candles and the WebSocket URL with your own endpoints. Candles are { time, open, high, low, close, volume } with time in ms (UTC); ticks are { time, price, volume }.");
  else notes.push("binance-demo uses Binance's free public market data, for trying things out. Use your own data source in production.");
  if (opts) notes.push("Settings passed to setOptions are checked by validate_options; see list_options for every setting.");
  const cdn = `https://unpkg.com/tickline@${VERSION}/dist/tickline.umd.js`;

  switch (input.framework) {
    case "html":
      return {
        files: [{
          name: "index.html",
          code: `<script src="${cdn}"></script>

${tag(' id="chart"')}

<script>
  const chart = document.getElementById("chart");
${opts ? `  chart.setOptions(${js(opts, "  ")});\n` : ""}${dataFns("  ")}

  candles().then((data) => {
    chart.setData(data);
    const ws = new WebSocket(${socketUrl});
    ws.onmessage = (e) => { ${onMessage} };
  });

  // older candles when the user scrolls back
  chart.addEventListener("tl-requesthistory", async (e) => chart.prependData(await candles(e.detail.before)));
</script>`,
        }],
        notes: [...notes, "No build step needed. With a bundler, use `npm i tickline` and `import \"tickline\"` instead of the script tag."],
      };
    case "javascript":
      return {
        files: [{
          name: "chart.js",
          code: `// npm i tickline
import { Chart } from "tickline";

const chart = new Chart(document.getElementById("chart-box"), {
  symbol: ${JSON.stringify(symbol)},
  timeframe: ${JSON.stringify(timeframe)},
  type: ${JSON.stringify(type)},
  theme: ${JSON.stringify(theme)},${opts ? `\n  ...${js(opts, "  ")},` : ""}
});
${ind ? ind.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const [id, ...p] = s.split(":"); return `chart.addIndicator(${JSON.stringify(id)}${p.length ? `, [${p.join(", ")}]` : ""});`; }).join("\n") + "\n" : ""}
${dataFns("")}

chart.setData(await candles());
const ws = new WebSocket(${socketUrl});
ws.onmessage = (e) => { ${onMessage} };
chart.on("requesthistory", async ({ before }) => chart.prependData(await candles(before)));`,
        }],
        notes: [...notes, `The element #chart-box needs a height, e.g. style="height: ${height}px".`, "The Chart class has no built-in buttons; use <trade-chart> for zoom, drawing, image and full-screen controls."],
      };
    case "react":
      return {
        files: [{
          name: "PriceChart.tsx",
          code: `// npm i tickline
import { useEffect, useRef } from "react";
import "tickline";
import type { TradeChartElement } from "tickline";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "trade-chart": React.DetailedHTMLProps<React.HTMLAttributes<TradeChartElement>, TradeChartElement> & Record<string, unknown>;
    }
  }
}

export function PriceChart() {
  const ref = useRef<TradeChartElement>(null);

  useEffect(() => {
    const chart = ref.current!;
    let ws: WebSocket | undefined, cancelled = false;
${opts ? `    chart.setOptions(${js(opts, "    ")});\n` : ""}${dataFns("    ").replace("(before)", "(before?: number)")}
    candles().then((data) => {
      if (cancelled) return;
      chart.setData(data);
      ws = new WebSocket(${socketUrl});
      ws.onmessage = (e) => { ${onMessage} };
    });
    const more = async (e: Event) => chart.prependData(await candles((e as CustomEvent).detail.before));
    chart.addEventListener("tl-requesthistory", more);
    return () => { cancelled = true; ws?.close(); chart.removeEventListener("tl-requesthistory", more); };
  }, []);

  return ${tag(" ref={ref}", " />").replace(`style="display: block; height: ${height}px"`, `style={{ display: "block", height: ${height} }}`)};
}`,
        }],
        notes,
      };
    case "vue":
      return {
        files: [{
          name: "PriceChart.vue",
          code: `<!-- npm i tickline; in vite.config: vue({ template: { compilerOptions: { isCustomElement: (t) => t === "trade-chart" } } }) -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import "tickline";
import type { TradeChartElement } from "tickline";

const el = ref<TradeChartElement>();
let ws: WebSocket | undefined;
${dataFns("").replace("(before)", "(before?: number)")}

onMounted(async () => {
  const chart = el.value!;
${opts ? `  chart.setOptions(${js(opts, "  ")});\n` : ""}  chart.setData(await candles());
  ws = new WebSocket(${socketUrl});
  ws.onmessage = (e) => { ${onMessage} };
});
onBeforeUnmount(() => ws?.close());

async function more(e: CustomEvent<{ before: number }>) {
  el.value!.prependData(await candles(e.detail.before));
}
</script>

<template>
  ${tag(' ref="el" @tl-requesthistory="more"', " />")}
</template>`.replace(/chart\.tick/g, "el.value?.tick"),
        }],
        notes,
      };
    case "angular":
      return {
        files: [{
          name: "price-chart.component.ts",
          code: `// npm i tickline
import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, OnDestroy, ViewChild } from "@angular/core";
import "tickline";
import type { TradeChartElement } from "tickline";

@Component({
  selector: "app-price-chart",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`${tag(" #chart (tl-requesthistory)=\"more($event)\"")}\`,
})
export class PriceChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild("chart") private ref!: ElementRef<TradeChartElement>;
  private ws?: WebSocket;
  private candles = (before?: number) => fetch(${historyUrl}).then((r) => r.json())${mapCandle};

  async ngAfterViewInit() {
    const chart = this.ref.nativeElement;
${opts ? `    chart.setOptions(${js(opts, "    ")});\n` : ""}    chart.setData(await this.candles());
    this.ws = new WebSocket(${socketUrl});
    this.ws.onmessage = (e) => { ${onMessage} };
  }

  async more(e: Event) {
    this.ref.nativeElement.prependData(await this.candles((e as CustomEvent<{ before: number }>).detail.before));
  }

  ngOnDestroy() { this.ws?.close(); }
}`,
        }],
        notes,
      };
    case "svelte":
      return {
        files: [{
          name: "PriceChart.svelte",
          code: `<!-- npm i tickline -->
<script>
  import { onMount } from "svelte";
  import "tickline";

  let chart;
${dataFns("  ")}

  onMount(() => {
    let ws;
${opts ? `    chart.setOptions(${js(opts, "    ")});\n` : ""}    candles().then((data) => {
      chart.setData(data);
      ws = new WebSocket(${socketUrl});
      ws.onmessage = (e) => { ${onMessage} };
    });
    const more = async (e) => chart.prependData(await candles(e.detail.before));
    chart.addEventListener("tl-requesthistory", more);
    return () => { ws?.close(); chart.removeEventListener("tl-requesthistory", more); };
  });
</script>

${tag(" bind:this={chart}")}`,
        }],
        notes,
      };
    case "blazor":
      return {
        files: [
          {
            name: "PriceChart.razor",
            code: `@* Add to App.razor (or index.html) before blazor.web.js:
     <script src="${cdn}"></script>
     <script src="tickline-interop.js"></script> *@
@inject IJSRuntime JS
@implements IAsyncDisposable

${tag(' id="@Id"')}

@code {
    private readonly string Id = $"chart-{Guid.NewGuid():N}";

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;
${opts ? `        await JS.InvokeVoidAsync("tickline.setOptions", Id, ${JSON.stringify(JSON.stringify(opts))});\n` : ""}        await JS.InvokeVoidAsync("tickline.setData", Id, await LoadCandlesAsync());
    }

    /// <summary>Call from your price feed (SignalR hub, hosted service, ...).</summary>
    public ValueTask PushTick(long time, double price, double volume = 0) =>
        JS.InvokeVoidAsync("tickline.tick", Id, new { time, price, volume });

    private Task<Candle[]> LoadCandlesAsync() => Task.FromResult(Array.Empty<Candle>()); // load from your service

    public async ValueTask DisposeAsync() { try { await JS.InvokeVoidAsync("tickline.dispose", Id); } catch (JSDisconnectedException) { } }

    // times are Unix ms (UTC); camelCase JSON is what the chart reads
    public record Candle(long Time, double Open, double High, double Low, double Close, double Volume = 0);
}`,
          },
          {
            name: "wwwroot/tickline-interop.js",
            code: `window.tickline = Object.assign(window.tickline || {}, {
  setOptions: (id, json) => document.getElementById(id).setOptions(JSON.parse(json)),
  setData: (id, candles) => document.getElementById(id).setData(candles),
  tick: (id, t) => document.getElementById(id).tick(t),
  dispose: () => {},
});`,
          },
        ],
        notes: ["Push live prices from .NET with PushTick (e.g. from a SignalR hub), or open a WebSocket in tickline-interop.js.", ...notes.slice(1)],
      };
  }
}
