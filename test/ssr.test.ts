// Runs in Node with no DOM, like a server render (Next.js, Nuxt, SvelteKit, Angular SSR).
import { describe, expect, it } from "vitest";

describe("server-side import", () => {
  it("can be imported without a browser", async () => {
    expect(typeof (globalThis as { HTMLElement?: unknown }).HTMLElement).toBe("undefined");
    const m = await import("../src/index");
    expect(typeof m.Chart).toBe("function");
    expect(typeof m.TradeChartElement).toBe("function");
    expect(m.defaultOptions().type).toBe("candles");
  });
});
