---
name: chart
description: Adds and configures Tickline live trading charts (the tickline npm package, the trade-chart element or the Chart class) in web apps. Use when the user wants a live price, candlestick, crypto, forex or stock chart in a website or app, or is working with code that imports tickline or renders trade-chart, including streaming prices, showing positions or alerts, drawing shapes, indicators, theming, translations, full screen or image export.
when_to_use: Examples - "add a live BTC chart to the dashboard", "show my open trades on the chart", "keep the live price in the middle", "translate the chart to German", "make the chart full screen in landscape on phones", "draw a circle around the high".
---

# Tickline charts

Tickline is a live trading chart: one `<trade-chart>` custom element (or `new Chart(container, options)`), fed with candles and live prices. Works in any framework. Full API in [reference.md](reference.md); docs at https://tickline-chart.vercel.app/docs/.

If the `tickline` MCP server is connected, use its tools: `get_snippet` for framework code, `validate_options` before writing any settings object, `list_options` and `search_docs` for details.

## Workflow

1. **Look at the project first**: framework (React/Next, Vue/Nuxt, Angular, Svelte, Blazor, plain HTML), how it already fetches data (REST client, WebSocket, SignalR), and where the chart goes.
2. **Install**: `npm i tickline` and `import "tickline"` once (registers the element). No build step: `<script src="https://unpkg.com/tickline@0.1.0/dist/tickline.umd.js"></script>` (global `Tickline`).
3. **Render the element with a height** (it fills its width; default height 420 px):
   `<trade-chart symbol="BTC/USDT" timeframe="1m" style="height: 480px"></trade-chart>`
4. **Load history** with `chart.setData(candles)`. Candles are `{ time, open, high, low, close, volume? }` with `time` = candle start in **milliseconds UTC**. Map the project's data to this shape.
5. **Stream prices** with `chart.tick({ time, price, volume })` per trade/quote, or `chart.update(candle)` for whole-candle (kline) feeds.
6. **Older history**: listen to `tl-requesthistory` and call `chart.prependData(candlesBefore(e.detail.before))`.
7. **Clean up**: close sockets when the component unmounts. The element destroys its chart when removed.
8. **Verify**: run the app, open the page, check the console is clean and the chart shows candles and moves with live prices.

## Rules that prevent most bugs

- Times are **milliseconds**. Seconds (10-digit numbers) put everything in 1970: multiply by 1000.
- Get the element by ref, then call methods. `setData`, `tick`, `setOptions` etc. queue until the element is in the page; `add…` methods (`addMarker`, `addShape`, `addIndicator`, `addDrawing`) and `addLayer` throw before that, so call them after mount.
- Events on the element are DOM `CustomEvent`s named `tl-…` with data in `e.detail`; on `Chart` use `chart.on("requesthistory", fn)` (no prefix). Use `addEventListener` in React (both 18 and 19).
- Changing timeframe only regroups into a **larger** timeframe; load fresh candles for the new one (`setLoading(true)` while loading).
- Importing `tickline` is SSR-safe, but render the chart client-side: Next.js `"use client"` + `dynamic(..., { ssr: false })`; Nuxt `<ClientOnly>`; Vue/Nuxt need `isCustomElement: (t) => t === "trade-chart"`; Angular needs `schemas: [CUSTOM_ELEMENTS_SCHEMA]`.
- React + TypeScript needs a JSX declaration for `trade-chart` (see reference.md).
- Settings merge: `setOptions({ grid: { vertical: false } })` changes one value. Lists and functions replace. Never invent setting names: check reference.md or `validate_options`.
- Functions (`format.*`, custom `lastPrice.marker`) can't go in the JSON `options` attribute; set them from JavaScript.
- Full screen must be started from a click or key press.
- Don't put trading logic in the chart: the app owns positions and P/L, and draws them with overlays.

## Common tasks

**Show a position** (entry, win zone, expiry):
```js
const ids = [
  chart.addZone({ from: "top", to: entry, start: openedAt, end: expiresAt, color: "rgba(34,195,142,.08)" }),
  chart.addPriceLine({ price: entry, from: openedAt, to: expiresAt, color: "#22c38e", axisLabel: false }),
  chart.addTimeLine({ time: expiresAt, countdown: true }),
  chart.addMarker({ time: openedAt, price: entry, side: "buy", text: "$10" }),
];
// on close: ids.forEach((id) => chart.removeOverlay(id));
```

**Price alert**: `chart.addAlert({ price, label })` and listen to `tl-alert` (`e.detail.direction` is `"up"`/`"down"`).

**Shapes from code**: `chart.addShape({ type: "circle" | "arrow" | "text" | "rect" | "ellipse" | "polygon" | "path" | "line" | "image", points: [{ time, price }, ...], ... })`. Anything else: `chart.addLayer((ctx, { timeToX, priceToY, width, height, live, candles }) => { ... }, { zIndex: "below" | "above" | "top", animate })`.

**Live price position**: `setOptions({ livePosition: { x: 0.5, y: 0.5 } })` (centre) or attribute `live-position="center"`.

**Live marker**: `live-marker="ripple"` (`pulse`, `ripple`, `radar`, `glow`, `dot`, `none`) or `lastPrice: { marker: (ctx, { x, y, color, now, animated }) => {...} }`.

**Indicators**: attribute `indicators="sma:20, ema:50, bb:20:2, rsi:14, macd:12:26:9, volume"` or `chart.addIndicator("rsi", { period: 14 }, { colors: ["#f5a524"], levels: [30, 70] })`.

**Theme**: `theme="light"`, CSS variables (`--tl-up`, `--tl-down`, `--tl-accent`, `--tl-background`, `--tl-font` …) or `setOptions({ theme: { base: "light", up: "#16a34a" } })`.

**Translate**: `setOptions({ locale: "de-DE", labels: { zoomIn: "Vergrößern", live: "Live ▸", tools: { trend: "Trendlinie" } } })`.

**Full screen and images**: `chart.toggleFullscreen()`, `chart.enterFullscreen({ orientation: "landscape" })`, `chart.downloadImage()`, `await chart.toBlob({ pixelRatio: 2 })`.

**Save a user's chart**: `localStorage.x = JSON.stringify(chart.getState())`; later load candles for `state.timeframe`, then `chart.setState(state)`.

**Several charts**: `import { syncCharts } from "tickline"; syncCharts([a, b])`.

## Examples

Complete components with live data: https://github.com/vongvisalsambath/tickline/tree/main/examples (plain HTML, React, Vue, Angular, Blazor). For a quick demo feed, Binance public data needs no key: `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500` (rows `[openTime, open, high, low, close, volume, ...]`, strings) and `wss://data-stream.binance.vision/ws/btcusdt@aggTrade` (`{ T: time, p: price, q: qty }`). Use the project's own data source in production.
