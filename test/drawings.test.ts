import { describe, expect, it } from "vitest";
import { distToDrawing, distToSegment, fibPrice, rayEnd, FIB_LEVELS } from "../src/drawings";

describe("drawing geometry", () => {
  it("distance to a segment, and to a ray", () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
    expect(distToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, true)).toBe(0);
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
  it("trend lines run to the edge of the plot", () => {
    expect(rayEnd({ x: 0, y: 100 }, { x: 10, y: 90 }, 200, 100)).toEqual({ x: 100, y: 0 });
    expect(rayEnd({ x: 0, y: 50 }, { x: 10, y: 50 }, 200, 100)).toEqual({ x: 200, y: 50 });
  });
  it("hit testing per tool", () => {
    const pts = [{ x: 10, y: 10 }, { x: 110, y: 60 }];
    expect(distToDrawing("horizontal", [{ x: 0, y: 40 }], { x: 300, y: 43 }, 400, 300)).toBe(3);
    expect(distToDrawing("vertical", [{ x: 40, y: 0 }], { x: 46, y: 250 }, 400, 300)).toBe(6);
    expect(distToDrawing("line", pts, { x: 300, y: 155 }, 400, 300)).toBeGreaterThan(100);
    expect(distToDrawing("trend", pts, { x: 310, y: 160 }, 400, 300)).toBeLessThan(1);
    expect(distToDrawing("fib", pts, { x: 300, y: 70 }, 400, 300, [10, 30, 70])).toBe(0);
  });
  it("fibonacci levels run from the second point (0) to the first (1)", () => {
    const a = { time: 0, price: 200 }, b = { time: 1, price: 100 };
    expect(fibPrice(a, b, 0)).toBe(100);
    expect(fibPrice(a, b, 1)).toBe(200);
    expect(fibPrice(a, b, 0.618)).toBeCloseTo(161.8);
    expect(FIB_LEVELS).toContain(0.5);
  });
});
