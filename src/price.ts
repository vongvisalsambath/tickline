// Price-axis ticks and price formatting.

/** A "nice" step (1, 2, 2.5 or 5 × 10ⁿ) so that `range` splits into about `count` parts. */
export function niceStep(range: number, count: number): number {
  if (!(range > 0) || !(count > 0)) return 1;
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** Ticks on round values between min and max. */
export function priceTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [];
  const step = niceStep(max - min, count);
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-9 && out.length < 100; v += step) out.push(roundTo(v, step));
  return out;
}

/** Decimal places of a step, e.g. 0.0005 → 4. */
export function stepDecimals(step: number): number {
  if (!(step > 0) || step >= 1) return 0;
  return Math.min(10, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
}

function roundTo(v: number, step: number): number {
  const d = stepDecimals(step) + 2;
  return Number(v.toFixed(d));
}

/**
 * A sensible number of decimals for prices of this size when none is given:
 * 68,123.45 → 2, 1.11942 → 5, 0.443085 → 6.
 */
export function autoPrecision(price: number): number {
  const a = Math.abs(price);
  if (!(a > 0)) return 2;
  if (a >= 1000) return 2;
  if (a >= 10) return 3;
  if (a >= 1) return 5;
  return Math.min(8, 6 - Math.floor(Math.log10(a)) - 1);
}

/** Formats with fixed decimals and thousands separators. */
export function formatPrice(price: number, decimals: number): string {
  if (!Number.isFinite(price)) return "–";
  const neg = price < 0;
  const [int, frac] = Math.abs(price).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "−" : "") + grouped + (frac !== undefined ? "." + frac : "");
}

/**
 * Splits a formatted price so the last `digits` digits can be drawn larger:
 * ("1.11942", 3) → ["1.11", "942"]; ("68,123.45", 3) → ["68,12", "3.45"].
 */
export function splitEmphasis(formatted: string, digits = 3): [string, string] {
  let count = 0, i = formatted.length;
  while (i > 0 && count < digits) {
    i--;
    if (/\d/.test(formatted[i])) count++;
  }
  // don't start the emphasised part with a separator
  while (i < formatted.length && /[.,]/.test(formatted[i])) i++;
  return [formatted.slice(0, i), formatted.slice(i)];
}
