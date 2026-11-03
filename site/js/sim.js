// A simulated market for demos and tests: a random walk with drift, bursts of volatility and gentle mean reversion.
// Deterministic for a given seed, so screenshots and tests are repeatable.

export function createMarket({ price = 1.11942, volatility = 0.00004, seed = 7 } = {}) {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const anchor = price;
  let p = price, vol = volatility;
  return {
    /** Next price after `ms` milliseconds. */
    step(ms) {
      const k = Math.sqrt(ms / 1000);
      if (rand() < 0.002) vol = volatility * (2 + rand() * 3); // a burst
      vol += (volatility - vol) * 0.01;
      p += p * vol * gauss() * k + (anchor - p) * 0.0004 * k;
      return p;
    },
    get price() { return p; },
  };
}

/** History candles for the last `count` candles of `tfMs`, built from simulated ticks, ending at `end`. */
export function history(market, { tfMs, count, end = Date.now(), tickMs }) {
  const step = tickMs ?? Math.max(250, Math.floor(tfMs / 20));
  const startBucket = Math.floor(end / tfMs) * tfMs - (count - 1) * tfMs;
  const out = [];
  for (let b = startBucket; b <= end; b += tfMs) {
    const c = { time: b, open: market.price, high: market.price, low: market.price, close: market.price, volume: 0 };
    for (let t = b; t < Math.min(b + tfMs, end); t += step) {
      const v = market.step(step);
      c.high = Math.max(c.high, v); c.low = Math.min(c.low, v); c.close = v; c.volume += 1 + Math.round(Math.random() * 4);
    }
    out.push(c);
  }
  return out;
}
