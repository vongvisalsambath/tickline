# Performance

Tickline is built to stay smooth on phones with fast feeds. Most of this happens by itself; this page explains it and the settings that matter.

## What it does by itself

- **Draws only when needed.** A still chart doesn't redraw. While prices are live it animates, up to `fps` frames a second.
- **Draws only what's visible.** Candles and indicator values outside the view are skipped, so long histories don't slow drawing down.
- **Pauses when hidden.** A chart scrolled off the screen, in a background tab or in a hidden element stops drawing, and catches up when it's visible again.
- **Computes indicators once per data change**, not once per frame.
- **One canvas, no DOM per candle.** The cost of a frame depends on the candles in view, not on how much history the chart holds.

## Settings that help

| Situation | Setting |
|---|---|
| Many charts on one page | `fps: 30` (or `fps="30"`) halves the drawing work while live |
| Battery-sensitive dashboards | `animation: { enabled: false }`, or `fps: 20` |
| Very fast feeds (hundreds of ticks a second) | Nothing: ticks only update data; drawing happens at most once a frame |
| Long sessions | Trim history you don't need with `setData` now and then, e.g. keep the last 20,000 candles |
| Many custom layers | Use `animate: true` only for layers that really animate |

## Feeding fast data

`tick` is cheap: it updates the current candle and asks for a frame. You don't need to throttle it. If your feed sends batches, call `tick` for each, in order.

For history, prefer one `setData` with all candles over many `update` calls.

## Big histories

`setData` and `prependData` sort and group candles. On a typical laptop that takes about 13 ms for 20,000 candles and 30 ms for 50,000 (phones are slower). Load what the user is likely to look at (500–2,000 candles) and let `tl-requesthistory` fetch older candles as they scroll.

## Measuring

Use your browser's performance panel while the chart is live. If frames take long, check custom layers and `format` functions first: they run every frame.
