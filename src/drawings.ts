// Drawing tools: the shapes, how many points each needs, and screen-space hit testing.

export type DrawingTool = "line" | "trend" | "arrow" | "horizontal" | "vertical" | "rect" | "circle" | "fib" | "measure" | "text";

export interface DrawingPoint { time: number; price: number }

/** A drawing on the chart. Plain data, so you can save it (JSON) and restore it with setDrawings(). */
export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
  /** Can't be moved or deleted by the user. */
  locked?: boolean;
  /** Kept but not drawn. */
  hidden?: boolean;
  /** The text of a text drawing. */
  text?: string;
  /** Font size of a text drawing in px. */
  fontSize?: number;
}

export const POINTS_NEEDED: Record<DrawingTool, number> = { line: 2, trend: 2, arrow: 2, horizontal: 1, vertical: 1, rect: 2, circle: 2, fib: 2, measure: 2, text: 1 };

export const TOOL_NAMES: Record<DrawingTool, string> = {
  line: "Line", trend: "Trend line", arrow: "Arrow", horizontal: "Horizontal line", vertical: "Vertical line", rect: "Rectangle",
  circle: "Circle", fib: "Fibonacci retracement", measure: "Measure", text: "Text",
};

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** Price of a Fibonacci level between the two points (0 at the second point, 1 at the first, as usually drawn from a swing). */
export function fibPrice(a: DrawingPoint, b: DrawingPoint, level: number): number {
  return b.price + (a.price - b.price) * level;
}

type XY = { x: number; y: number };

/** Distance from p to the segment a–b (or the ray from a through b when `ray`). */
export function distToSegment(p: XY, a: XY, b: XY, ray = false): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = ray ? Math.max(0, t) : Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Where the ray from a through b leaves the box [0, w] × [0, h] (for trend lines). */
export function rayEnd(a: XY, b: XY, w: number, h: number): XY {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (w - a.x) / dx);
  if (dx < 0) t = Math.min(t, (0 - a.x) / dx);
  if (dy > 0) t = Math.min(t, (h - a.y) / dy);
  if (dy < 0) t = Math.min(t, (0 - a.y) / dy);
  if (!Number.isFinite(t) || t < 1) t = 1;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/**
 * How close (px) the pointer is to a drawing, given its points in screen space.
 * `fibYs` are the screen y of each Fibonacci level; `right` is the plot's right edge.
 */
export function distToDrawing(tool: DrawingTool, pts: XY[], p: XY, right: number, bottom: number, fibYs: number[] = []): number {
  switch (tool) {
    case "horizontal": return Math.abs(p.y - pts[0].y);
    case "vertical": return Math.abs(p.x - pts[0].x);
    case "line":
    case "arrow": return distToSegment(p, pts[0], pts[1]);
    case "circle": {
      // inside counts as on it
      const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      return Math.max(0, Math.hypot(p.x - pts[0].x, p.y - pts[0].y) - r);
    }
    case "text": return Infinity; // the chart hit-tests text by its drawn box
    case "trend": return distToSegment(p, pts[0], rayEnd(pts[0], pts[1], right, bottom));
    case "rect":
    case "measure": {
      // inside counts as on it, so boxes are easy to grab
      const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x);
      const y1 = Math.min(pts[0].y, pts[1].y), y2 = Math.max(pts[0].y, pts[1].y);
      const dx = Math.max(x1 - p.x, 0, p.x - x2), dy = Math.max(y1 - p.y, 0, p.y - y2);
      return Math.hypot(dx, dy);
    }
    case "fib": {
      const left = Math.min(pts[0].x, pts[1].x);
      let d = distToSegment(p, pts[0], pts[1]);
      for (const y of fibYs) if (p.x >= left - 4) d = Math.min(d, Math.abs(p.y - y));
      return d;
    }
  }
}
