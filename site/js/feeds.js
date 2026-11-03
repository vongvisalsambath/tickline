// Market data for the demo: live crypto prices from Binance's public market-data mirror, or a simulated market.
// Public endpoints only (no key). If the live feed can't be reached, the demo falls back to simulated prices.
import { createMarket, history } from "./sim.js";

export const MARKETS = [
  { id: "BTCUSDT", label: "BTC/USDT", live: true },
  { id: "ETHUSDT", label: "ETH/USDT", live: true },
  { id: "SOLUSDT", label: "SOL/USDT", live: true },
  { id: "SIM", label: "EUR/USD (simulated)", live: false },
];

export const TIMEFRAMES = ["1s", "1m", "5m", "15m", "1h", "4h", "1d"];
const TF_MS = { "1s": 1e3, "1m": 6e4, "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };

const REST = "https://data-api.binance.vision/api/v3/klines";
const WS = "wss://data-stream.binance.vision/ws/";

/** Candles ending before `endTime` (or now). */
export async function loadHistory(market, tf, endTime, limit = 500) {
  if (!market.live) return simHistory(market, tf, endTime, limit);
  const url = `${REST}?symbol=${market.id}&interval=${tf}&limit=${limit}${endTime ? `&endTime=${endTime - 1}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`History request failed (${res.status})`);
  const rows = await res.json();
  return rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
}

/**
 * Live prices. Calls onTick({ time, price, volume }) for every trade, and onStatus("live" | "connecting" | "offline").
 * Returns a function that stops the feed.
 */
export function subscribe(market, onTick, onStatus) {
  if (!market.live) {
    const m = simMarket(market);
    onStatus("simulated");
    const t = setInterval(() => onTick({ time: Date.now(), price: m.step(250), volume: 1 }), 250);
    return () => clearInterval(t);
  }
  let ws, stopped = false, tries = 0, timer;
  const open = () => {
    onStatus("connecting");
    ws = new WebSocket(`${WS}${market.id.toLowerCase()}@aggTrade`);
    ws.onopen = () => { tries = 0; onStatus("live"); };
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.p) onTick({ time: d.T, price: +d.p, volume: +d.q });
    };
    ws.onclose = () => {
      if (stopped) return;
      onStatus(++tries > 3 ? "offline" : "connecting");
      timer = setTimeout(open, Math.min(15000, 1000 * 2 ** tries));
    };
  };
  open();
  return () => { stopped = true; clearTimeout(timer); ws?.close(); };
}

// ------------------------------------------------------------------ simulated market (one per demo market, so it continues across reloads of history)

const sims = new Map();
function simMarket(market) {
  if (!sims.has(market.id)) sims.set(market.id, createMarket({ price: 1.11942, volatility: 0.00004, seed: 11 }));
  return sims.get(market.id);
}

function simHistory(market, tf, endTime, limit) {
  const tfMs = TF_MS[tf] ?? 6e4;
  if (!endTime) return history(simMarket(market), { tfMs, count: Math.min(limit, 400) });
  // older candles: a separate walk, shifted so it meets the oldest candle we already have
  const older = history(createMarket({ price: 1.11942, volatility: 0.00004, seed: (endTime / tfMs) | 0 }), { tfMs, count: Math.min(limit, 300), end: endTime - tfMs });
  return older;
}
