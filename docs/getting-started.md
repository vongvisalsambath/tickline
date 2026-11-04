# Getting started

This page takes you from nothing to a live chart. It takes about five minutes.

## 1. Install

With npm (or pnpm, yarn, bun):

```sh
npm i tickline
```

```js
import "tickline"; // registers the <trade-chart> element
```

Or without a build step, with a script tag:

```html
<script src="https://unpkg.com/tickline@0.1.0/dist/tickline.umd.js"></script>
```

The script tag also gives you a global `Tickline` object with everything the package exports (`Tickline.Chart`, `Tickline.syncCharts` and so on).

## 2. Put a chart on the page

```html
<trade-chart id="chart" symbol="BTC/USDT" timeframe="1m" style="height: 480px"></trade-chart>
```

Give it a height: it fills its width and the height you set (420 px if you set none). Attributes set the common settings: `type`, `timeframe`, `theme`, `indicators` and [more](configuration.md#attributes).

## 3. Load history

The chart takes candles: objects with a start `time` in milliseconds (UTC) and `open`, `high`, `low`, `close`, and optionally `volume`.

```js
const chart = document.getElementById("chart");

const candles = await fetch("/api/candles?symbol=BTCUSDT&tf=1m").then((r) => r.json());
// [{ time: 1793714700000, open: 77194.01, high: 77196.48, low: 77148, close: 77178.01, volume: 11.7 }, ...]
chart.setData(candles);
```

Order doesn't matter, and candles are grouped into the chart's timeframe, so you can even give 1-minute candles to a 5-minute chart.

## 4. Stream live prices

Pass every trade or quote to `tick`. The chart grows the current candle, starts a new one when its time is up, and animates the price smoothly.

```js
const ws = new WebSocket("wss://your-server.example/prices?symbol=BTCUSDT");
ws.onmessage = (e) => {
  const { time, price, volume } = JSON.parse(e.data);
  chart.tick({ time, price, volume });
};
```

If your feed sends whole candles instead (a "kline" stream), use `chart.update(candle)`.

## 5. Load older history when the user scrolls back

```js
chart.addEventListener("tl-requesthistory", async (e) => {
  const older = await fetch(`/api/candles?symbol=BTCUSDT&tf=1m&before=${e.detail.before}`).then((r) => r.json());
  chart.prependData(older);
});
```

That's a complete live chart. Your users can zoom (wheel, pinch, + −), pan (drag, arrow keys), draw, download an image and go full screen.

## Try it with real data

Binance's public market data needs no account or key, so it's handy for trying things out:

```html
<trade-chart id="chart" symbol="BTC/USDT" timeframe="1m" indicators="sma:20, volume" style="height: 480px"></trade-chart>
<script type="module">
  import "https://unpkg.com/tickline@0.1.0/dist/tickline.js";
  const chart = document.getElementById("chart");
  const url = (before) => `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500${before ? `&endTime=${before - 1}` : ""}`;
  const load = (before) => fetch(url(before)).then((r) => r.json())
    .then((rows) => rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] })));

  chart.setData(await load());
  const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@aggTrade");
  ws.onmessage = (e) => { const t = JSON.parse(e.data); chart.tick({ time: t.T, price: +t.p, volume: +t.q }); };
  chart.addEventListener("tl-requesthistory", async (e) => chart.prependData(await load(e.detail.before)));
</script>
```

## Next

- Show your users' trades: [Overlays, shapes and drawings](drawing.md)
- Change how it looks and behaves: [Configuration](configuration.md)
- Use it in React, Vue, Angular, Svelte or Blazor: [Frameworks](frameworks.md)
- Without the element: `new Chart(container, options)` works the same, with `chart.on("requesthistory", ...)` for events. See the [API reference](api.md).
