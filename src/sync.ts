// Keeps several charts in step: the same time range and a shared crosshair (for multi-chart layouts).
import type { Chart } from "./chart";
import type { VisibleRange } from "./types";

/** A Chart, or a <trade-chart> element (its engine is used once it's in the page). */
export type SyncTarget = Chart | { readonly chart: Chart | null };

export interface SyncOptions {
  /** Scroll and zoom together (default true). */
  range?: boolean;
  /** Show the crosshair time on every chart (default true). */
  crosshair?: boolean;
}

// a Chart has its canvas; a <trade-chart> element has none, only its engine
const engine = (t: SyncTarget): Chart | null => ("canvas" in t ? (t as Chart) : t.chart);

/**
 * Links charts so scrolling, zooming and the crosshair on one moves the others.
 * Returns a function that unlinks them.
 * @example const unlink = syncCharts([priceChart, volumeChart]);
 */
export function syncCharts(targets: SyncTarget[], o: SyncOptions = {}): () => void {
  const charts = targets.map(engine).filter((c): c is Chart => !!c);
  if (charts.length !== targets.length) throw new Error("syncCharts: every <trade-chart> must be in the page first.");
  const offs: (() => void)[] = [];
  const close = (a: VisibleRange, b: VisibleRange) => {
    const tol = Math.max(1, (a.to - a.from) * 0.002);
    return Math.abs(a.from - b.from) <= tol && Math.abs(a.to - b.to) <= tol;
  };
  for (const a of charts) {
    if (o.range !== false) {
      offs.push(a.on("rangechange", (r) => {
        for (const b of charts) {
          if (b === a) continue;
          if (a.isFollowing && b.isFollowing && close(b.visibleRange, r)) continue;
          if (!a.isFollowing && close(b.visibleRange, r)) continue;
          b.setVisibleRange(r, { follow: a.isFollowing, animate: false });
        }
      }));
    }
    if (o.crosshair !== false) {
      offs.push(a.on("crosshair", (info) => {
        for (const b of charts) if (b !== a) b.setCrosshair(info ? info.time : null);
      }));
    }
  }
  return () => {
    offs.forEach((f) => f());
    charts.forEach((c) => c.setCrosshair(null));
  };
}
