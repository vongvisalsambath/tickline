// The "Configure almost everything" playground: form controls → chart.setOptions(), and the code for the changed settings.
import "../lib/tickline.js";
import { createMarket, history } from "./sim.js";
import { highlight } from "./highlight.js";

const chart = document.getElementById("custom-chart");
const form = document.getElementById("knobs");
const codeEl = document.querySelector("#options-code code");
const LANGS = {
  de: {
    locale: "de-DE",
    labels: {
      open: "E", high: "H", low: "T", close: "S",
      zoomIn: "Vergrößern", zoomOut: "Verkleinern", backToLive: "Zurück zum Live-Kurs", live: "Live ▸",
      zoomLimit: "Maximaler Zoom ({n} Kerzen). Wähle einen kleineren Zeitraum für mehr Details.",
      drawingTools: "Zeichenwerkzeuge", delete: "Löschen", deleteDrawing: "Zeichnung löschen", color: "Farbe",
      tools: { line: "Linie", trend: "Trendlinie", horizontal: "Horizontale Linie", vertical: "Vertikale Linie", fib: "Fibonacci-Retracement" },
    },
  },
  fr: {
    locale: "fr-FR",
    labels: {
      open: "O", high: "H", low: "B", close: "C",
      zoomIn: "Zoom avant", zoomOut: "Zoom arrière", backToLive: "Revenir au direct", live: "Direct ▸",
      zoomLimit: "Zoom maximal ({n} bougies). Choisissez une unité de temps plus courte pour plus de détails.",
      drawingTools: "Outils de dessin", delete: "Supprimer", deleteDrawing: "Supprimer le dessin", color: "Couleur",
      tools: { line: "Ligne", trend: "Ligne de tendance", horizontal: "Ligne horizontale", vertical: "Ligne verticale", fib: "Retracement de Fibonacci" },
    },
  },
  ja: {
    locale: "ja-JP",
    labels: {
      open: "始", high: "高", low: "安", close: "終",
      zoomIn: "拡大", zoomOut: "縮小", backToLive: "最新に戻る", live: "最新 ▸",
      zoomLimit: "これ以上拡大できません（{n} 本）。より短い時間足を選んでください。",
      drawingTools: "描画ツール", delete: "削除", deleteDrawing: "描画を削除", color: "色",
      tools: { line: "直線", trend: "トレンドライン", horizontal: "水平線", vertical: "垂直線", fib: "フィボナッチ・リトレースメント" },
    },
  },
};

function init() {
  // simulated prices, so this chart works offline and doesn't share the demo's feed
  const market = createMarket({ price: 1.0842, volatility: 0.00005, seed: 23 });
  chart.setData(history(market, { tfMs: 60_000, count: 240 }));
  setInterval(() => chart.tick({ time: Date.now(), price: market.step(400), volume: 1 }), 400);

  const touched = new Set(); // colours count as changed only after the user picks one
  form.addEventListener("input", (e) => { if (e.target.type === "color") touched.add(e.target.name); apply(); });
  form.addEventListener("change", apply);
  form.addEventListener("reset", () => { touched.clear(); setTimeout(() => { chart.setOptions({ theme: document.documentElement.dataset.theme || "dark" }); apply(); }); });

  document.getElementById("copy-options").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(codeEl.textContent); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy"), 1500); } catch { /* clipboard blocked */ }
  });
  // keep the colour pickers on the theme's colours until the user changes them
  new MutationObserver(() => { if (!touched.size) syncColours(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  syncColours();
  apply();

  function syncColours() {
    const t = chart.currentTheme;
    form.up.value = t.up;
    form.down.value = t.down;
  }

  function apply() {
    const f = form.elements;
    const v = (n) => f[n].value, on = (n) => f[n].checked;
    const grid = v("grid");
    const pos = { auto: { x: null, y: null }, center: { x: 0.5, y: 0.5 }, right: { x: 0.8, y: 0.5 }, x: { x: 0.5, y: null } }[v("pos")];
    // every setting from the form, so turning something back on works too
    const all = {
      type: v("type"),
      grid: { horizontal: grid === "both" || grid === "horizontal", vertical: grid === "both" || grid === "vertical" },
      crosshair: { mode: v("crosshair") },
      lastPrice: { line: v("line"), countdown: on("countdown"), marker: v("marker") },
      series: { candleWidth: +v("candleWidth"), wicks: on("wicks"), highLowLabels: on("highLow") },
      livePosition: pos,
      watermark: { text: on("watermark") ? "{symbol}" : "" },
      layout: { fontSize: +v("fontSize") },
      timeScale: { rightPadding: +v("rightPadding"), visible: on("timeScale") },
      priceScale: { visible: on("priceScale") },
      legend: { visible: on("legend") },
      ui: { drawingToolbar: on("toolbar"), zoomButtons: on("zoomButtons") },
      interaction: { pan: on("pan"), wheelZoom: on("wheelZoom") },
      animation: { enabled: on("animate") },
      locale: LANGS[v("lang")]?.locale ?? "",
      labels: LANGS[v("lang")]?.labels ?? defaultLabels(),
    };
    const colours = {};
    for (const n of touched) colours[n] = v(n);
    chart.setOptions(touched.size ? { ...all, theme: colours } : all);
    show(diff(all, colours));
  }

  // only what differs from the defaults goes in the code sample
  function diff(all, colours) {
    const d = defaults;
    const out = {};
    const put = (path, value) => {
      const keys = path.split(".");
      let o = out;
      keys.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
      o[keys.at(-1)] = value;
    };
    const walk = (obj, base, prefix) => {
      for (const [k, val] of Object.entries(obj)) {
        if (k === "labels" || k === "locale") continue;
        const path = prefix ? `${prefix}.${k}` : k;
        if (val && typeof val === "object") {
          // a group like livePosition goes in whole, so { x: 0.5, y: null } stays readable
          if (k === "livePosition") { if (val.x !== base?.[k]?.x || val.y !== base?.[k]?.y) put(path, val); continue; }
          walk(val, base?.[k], path);
        }
        else if (base?.[k] !== val) put(path, val);
      }
    };
    walk(all, d, "");
    if (all.locale) { out.locale = all.locale; out.labels = all.labels; }
    if (Object.keys(colours).length) out.theme = colours;
    return out;
  }

  function show(o) {
    const body = Object.keys(o).length ? toJs(o, 0) : "{}";
    codeEl.textContent = Object.keys(o).length
      ? `chart.setOptions(${body});`
      : "// Everything is at its default. Change a setting to see the code.";
    highlight(codeEl);
  }
}

const defaults = {
  type: "candles",
  grid: { horizontal: true, vertical: true },
  crosshair: { mode: "snap" },
  lastPrice: { line: "short", countdown: true, marker: "pulse" },
  series: { candleWidth: 0.72, wicks: true, highLowLabels: false },
  livePosition: { x: null, y: null },
  watermark: { text: "" },
  layout: { fontSize: 11 },
  timeScale: { rightPadding: 0.2, visible: true },
  priceScale: { visible: true },
  legend: { visible: true },
  ui: { drawingToolbar: true, zoomButtons: true },
  interaction: { pan: true, wheelZoom: true },
  animation: { enabled: true },
};

function defaultLabels() {
  return {
    open: "O", high: "H", low: "L", close: "C", zoomIn: "Zoom in", zoomOut: "Zoom out", backToLive: "Back to live", live: "Live ▸",
    zoomLimit: "You're at the closest zoom ({n} candles). Pick a smaller timeframe to see more detail.",
    drawingTools: "Drawing tools", delete: "Delete", deleteDrawing: "Delete drawing", color: "Colour",
    tools: { line: "Line", trend: "Trend line", horizontal: "Horizontal line", vertical: "Vertical line", fib: "Fibonacci retracement" },
  };
}

/** A JavaScript object literal: unquoted keys, two-space indent, short objects on one line. */
function toJs(v, depth) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v !== "object" || v === null) return String(v);
  const pad = "  ".repeat(depth + 1), end = "  ".repeat(depth);
  const parts = Object.entries(v).map(([k, x]) => `${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${toJs(x, depth + 1)}`);
  const one = `{ ${parts.join(", ")} }`;
  return one.length + depth * 2 < 76 ? one : `{\n${parts.map((p) => pad + p).join(",\n")},\n${end}}`;
}

if (chart && form && codeEl) init();
