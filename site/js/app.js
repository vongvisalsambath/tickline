// The demo page: market, timeframe, type and indicator controls, live data, practice positions, theme, code highlighting.
import "../lib/tickline.js";
import { MARKETS, TIMEFRAMES, loadHistory, subscribe } from "./feeds.js";
import { createPositions } from "./positions.js";
import { highlight } from "./highlight.js";

const chart = document.getElementById("chart");
const $ = (s) => document.querySelector(s);
const statusEl = $("#status");
let market = MARKETS[0], tf = "1m", stop = null, lastPrice = NaN, loadToken = 0;

// ------------------------------------------------------------------ controls
const marketSel = $("#market");
marketSel.innerHTML = MARKETS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
marketSel.onchange = () => { market = MARKETS.find((m) => m.id === marketSel.value); start(); };

const tfs = $("#tfs");
tfs.innerHTML = TIMEFRAMES.map((t) => `<button type="button" role="radio" aria-checked="${t === tf}" data-tf="${t}">${t}</button>`).join("");
tfs.onclick = (e) => {
  const b = e.target.closest("[data-tf]");
  if (!b) return;
  tf = b.dataset.tf;
  tfs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  start();
};

$("#type").onchange = (e) => chart.setAttribute("type", e.target.value);

const IND = [["sma:20", "SMA"], ["ema:50", "EMA"], ["bb:20:2", "BB"], ["rsi:14", "RSI"], ["macd:12:26:9", "MACD"], ["volume", "Vol"]];
const on = new Set(["volume"]);
const inds = $("#inds");
const renderInds = () => {
  inds.innerHTML = IND.map(([v, l]) => `<button type="button" aria-pressed="${on.has(v)}" data-ind="${v}">${l}</button>`).join("");
  chart.setAttribute("indicators", [...on].join(","));
};
inds.onclick = (e) => {
  const b = e.target.closest("[data-ind]");
  if (!b) return;
  on.has(b.dataset.ind) ? on.delete(b.dataset.ind) : on.add(b.dataset.ind);
  renderInds();
};
// closing an indicator from its pane updates the buttons
chart.addEventListener("tl-indicatorschange", (e) => {
  const ids = new Set(e.detail.map((i) => i.id));
  for (const v of [...on]) if (!ids.has(v.split(":")[0])) on.delete(v);
  inds.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(on.has(b.dataset.ind))));
});
renderInds();

// ------------------------------------------------------------------ data
function setStatus(s) {
  const text = { live: "Live", connecting: "Connecting…", offline: "Live feed unavailable: simulated prices", simulated: "Simulated prices" }[s] ?? s;
  statusEl.textContent = text;
  statusEl.classList.toggle("live", s === "live");
  if (s === "offline" && market.live) { market = MARKETS.find((m) => !m.live); marketSel.value = market.id; start(); }
}

async function start() {
  const token = ++loadToken;
  stop?.();
  chart.setAttribute("symbol", market.label);
  chart.setAttribute("timeframe", tf);
  setStatus("connecting");
  chart.setLoading(true);
  let candles;
  try {
    candles = await loadHistory(market, tf);
  } catch {
    chart.setLoading(false);
    if (market.live) { market = MARKETS.find((m) => !m.live); marketSel.value = market.id; setStatus("offline"); return; }
    throw new Error("No data");
  }
  if (token !== loadToken) return;
  chart.setData(candles);
  chart.setLoading(false);
  lastPrice = candles.at(-1)?.close ?? NaN;
  stop = subscribe(market, (t) => { lastPrice = t.price; chart.tick(t); }, setStatus);
}

chart.addEventListener("tl-requesthistory", async (e) => {
  const token = loadToken;
  try {
    let older = await loadHistory(market, tf, e.detail.before);
    if (token !== loadToken || !older.length) return;
    if (!market.live) {
      // line the simulated history up with the oldest candle on the chart
      const first = chart.chart.data[0];
      const shift = first.open - older.at(-1).close;
      older = older.map((c) => ({ ...c, open: c.open + shift, high: c.high + shift, low: c.low + shift, close: c.close + shift }));
    }
    chart.prependData(older);
  } catch { /* try again on the next scroll */ }
});

// ------------------------------------------------------------------ practice positions (demo of the overlay API)
const money = (v) => (v >= 0 ? "+$" : "−$") + Math.abs(v).toFixed(2);
const positions = createPositions(chart, {
  getPrice: () => lastPrice,
  onChange: ({ count, expected }) => {
    const el = $("#pl");
    el.textContent = count ? `${count} open · expected ${money(expected)}` : "";
    el.style.color = expected >= 0 ? "var(--up)" : "var(--down)";
  },
});
document.querySelectorAll(".pos[data-side]").forEach((b) => (b.onclick = () => Number.isFinite(lastPrice) && positions.place(b.dataset.side, 10, 60_000)));

// price alert: a line a little above the live price; the chart fires tl-alert when it's crossed
$("#alert-btn").onclick = () => {
  if (!Number.isFinite(lastPrice)) return;
  chart.addAlert({ price: lastPrice * 1.0005, label: "Alert" });
  $("#pl").textContent = "Alert set";
  $("#pl").style.color = "";
};
chart.addEventListener("tl-alert", (e) => {
  const el = $("#pl");
  el.textContent = `Alert hit: price went ${e.detail.direction} through ${e.detail.price.toFixed(2)}`;
  el.style.color = "var(--accent-ink)";
});

// ------------------------------------------------------------------ theme
const themeBtn = $("[data-theme-toggle]");
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll("trade-chart").forEach((c) => c.setAttribute("theme", t));
  themeBtn.textContent = t === "light" ? "☾" : "☀";
  themeBtn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
  try { localStorage.setItem("tl-theme", t); } catch {}
}
let saved = null;
try { saved = localStorage.getItem("tl-theme"); } catch {}
setTheme(saved ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
themeBtn.onclick = () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");

// ------------------------------------------------------------------ copy, tabs, highlighting
document.querySelectorAll("[data-copy]").forEach((el) => el.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(el.dataset.copy); el.classList.add("copied"); setTimeout(() => el.classList.remove("copied"), 1500); } catch {}
}));

document.querySelectorAll("[data-tabs]").forEach((root) => {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => tabs.forEach((t) => {
    const sel = t === tab;
    t.setAttribute("aria-selected", String(sel));
    t.tabIndex = sel ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !sel;
    if (sel && focus) t.focus();
  });
  tabs.forEach((t, i) => {
    t.onclick = () => select(t);
    t.onkeydown = (e) => {
      const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      select(tabs[(n + tabs.length) % tabs.length], true);
    };
  });
});

document.querySelectorAll("pre code").forEach(highlight);

start();
