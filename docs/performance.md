# Performance

Tickline is built to stay smooth on phones with fast feeds. Most of this happens by itself; this page explains it and the settings that matter.

## What it does by itself

- **Draws only when needed.** A still chart doesn't redraw. While prices are live it animates, up to `fps` frames a second.
- **Draws only what's visible.** Candles and indicator values outside the view are skipped, so long histories don't slow drawing down.
- **Pauses when hidden.** A chart scrolled off the screen, in a background tab or in a hidden element stops drawing, and catches up when it's visible again.
- **Computes indicators once per data change**, not once per frame. On long histories (more than `history.indicatorWindow` candles, default 20,000) it computes them only for the candles around the view, plus a warm-up, so a live tick doesn't redo the whole history.
- **One canvas, no DOM per candle.** The cost of a frame depends on the candles in view, not on how much history the chart holds.

## Settings that help

| Situation | Setting |
|---|---|
| Many charts on one page | `fps: 30` (or `fps="30"`) halves the drawing work while live |
| Battery-sensitive dashboards | `animation: { enabled: false }`, or `fps: 20` |
| Very fast feeds (hundreds of ticks a second) | Nothing: ticks only update data; drawing happens at most once a frame |
| Long sessions | Nothing: `history.maxCandles` (default 100,000) drops the oldest candles that are out of view |
| Many custom layers | Use `animate: true` only for layers that really animate |

## Feeding fast data

`tick` is cheap: it updates the current candle and asks for a frame. You don't need to throttle it. If your feed sends batches, call `tick` for each, in order.

For history, prefer one `setData` with all candles over many `update` calls.

## Big histories

Don't send millions of candles up front. Load a page and let the chart load older pages as the user scrolls back, with a [history loader](data.md#loading-history-page-by-page):

```js
chart.setHistoryLoader(({ before, count, signal }) => api.candles({ before, limit: count, signal }));
```

`setData` and `prependData` sort and group candles. On a typical laptop that takes about 13 ms for 20,000 candles and 30 ms for 50,000 (phones are slower).

If you do hold a very long history, the chart copes:

- Only the candles in view are drawn, and zoom is limited to `timeScale.maxVisibleCandles` (3000) across the chart, so a frame never draws more than that.
- Indicators are computed for the part in view (`history.indicatorWindow`). Indicators you [register](indicators.md#writing-your-own) are computed the same way; set `window: false` on one that needs every candle from the start, such as a running total.
- Heikin-Ashi candles are updated at the end, not recomputed, when a tick arrives.

Measured in Node (happy-dom) on the machine that builds Tickline, with 1,000,000 one-minute candles and five indicators (SMA, EMA, MACD, RSI, volume), counting the chart's own work and not the browser's drawing:

| | `indicatorWindow` 20,000 (default) | `indicatorWindow` 0 (everything) |
|---|---|---|
| `setData` | 242 ms | 575 ms |
| A live tick and the next frame | 1.4 ms | 82.6 ms |

The test suite checks that a tick and frame stay under 25 ms at a million candles. Your numbers will differ with the device; phones are slower.

## Measuring

Use your browser's performance panel while the chart is live. If frames take long, check custom layers and `format` functions first: they run every frame.
