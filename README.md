# Tickline

A live trading chart for any website. One `<trade-chart>` tag gives you smooth real-time prices, candles, indicators, drawing tools and markers for your users' positions. It works in plain HTML, React, Vue, Angular, Blazor, or anything else that renders HTML.

**[Live demo and docs](https://tickline-chart.vercel.app)** · about 19 KB gzipped · no dependencies · MIT

- **Feels live.** The price eases between trades, the scale glides, and a countdown shows the time left in the candle.
- **Six chart types.** Candles, hollow candles, bars, Heikin-Ashi, line and area. Timeframes from 5 seconds to 1 month.
- **Indicators.** SMA, EMA, Bollinger Bands, RSI, MACD and volume, in resizable panes. Register your own.
- **Drawing tools.** Line, trend line, horizontal, vertical and Fibonacci retracement. Users can select, drag, recolour and delete them, and you can save and restore them as JSON.
- **Positions.** Markers, price lines, time lines with countdowns, and shaded zones show trades, orders and expiries.
- **Made for real use.** Touch and keyboard, HiDPI screens, light and dark themes, CSS variables. It pauses when hidden, caps the frame rate and loads older history on demand.

## Install

```sh
npm i tickline
```

```js
import "tickline"; // registers <trade-chart>
```

Or without a build step:

```html
<script src="https://unpkg.com/tickline@0.1.0/dist/tickline.umd.js"></script>
```

## Use

```html
<trade-chart id="chart" symbol="BTC/USDT" timeframe="1m" type="candles"
             theme="dark" indicators="sma:20, volume" style="height: 480px"></trade-chart>

<script type="module">
  const chart = document.getElementById("chart");

  // history: [{ time, open, high, low, close, volume }, ...] with times in ms (UTC)
  chart.setData(await fetch("/api/candles?tf=1m").then((r) => r.json()));

  // live trades or quotes: the chart groups them into candles
  socket.onmessage = (e) => {
    const { time, price, volume } = JSON.parse(e.data);
    chart.tick({ time, price, volume });
  };

  // load older candles when the user scrolls back
  chart.addEventListener("tl-requesthistory", async (e) => {
    chart.prependData(await fetch(`/api/candles?tf=1m&before=${e.detail.before}`).then((r) => r.json()));
  });
</script>
```

If your feed sends whole candles (for example a kline stream), call `chart.update(candle)` instead of `tick`.

### Show a position

```js
const now = Date.now(), entry = 68123.45, expiry = now + 60_000;

chart.addMarker({ time: now, price: entry, side: "buy", text: "$10" });
chart.addPriceLine({ price: entry, from: now, to: expiry, color: "#22c38e", label: "Entry" });
chart.addZone({ from: "top", to: entry, start: now, end: expiry, color: "rgba(34,195,142,.08)" });
const expiryLine = chart.addTimeLine({ time: expiry, countdown: true, label: "Expiry" });

chart.removeOverlay(expiryLine); // every add… method returns an id
```

### Frameworks

`<trade-chart>` is a standard custom element. Complete components, each with a live price feed, are in [`examples/`](examples):

| | |
|---|---|
| Plain HTML | [`examples/plain.html`](examples/plain.html) |
| React | [`examples/react/PriceChart.tsx`](examples/react/PriceChart.tsx) |
| Vue | [`examples/vue/PriceChart.vue`](examples/vue/PriceChart.vue) |
| Angular | [`examples/angular/price-chart.component.ts`](examples/angular/price-chart.component.ts) |
| Blazor | [`examples/blazor/PriceChart.razor`](examples/blazor/PriceChart.razor) with [`tickline-interop.js`](examples/blazor/wwwroot/tickline-interop.js) |

Without the custom element, use the `Chart` class on any element:

```js
import { Chart } from "tickline";
const chart = new Chart(document.getElementById("box"), { symbol: "EUR/USD", timeframe: "5m", theme: "light" });
```

## Reference

### Attributes

| Attribute | Values |
|---|---|
| `type` | `candles` (default), `hollow`, `bars`, `heikin-ashi`, `line`, `area` |
| `timeframe` | `5s`, `1m`, `15m`, `1h`, `4h`, `1d`, `1w`, `1M` and so on |
| `symbol` | Name in the legend |
| `theme` | `dark` (default) or `light` |
| `indicators` | Comma-separated, with optional parameters: `sma:20, ema:50, bb:20:2, rsi:14, macd:12:26:9, volume` |
| `precision` | Price decimals (default: worked out from the data) |
| `price-line` | `short` (default), `full` or `none` |
| `countdown` | `false` hides the candle timer |
| `timezone` | `local` (default) or minutes from UTC, for example `420` |
| `fps` | Frame-rate cap (default 60) |
| `right-padding` | Space to the right of the live candle, as a share of the width (default 0.2) |
| `drawing-tools` | `false` hides the drawing toolbar |
| `controls` | `none` hides all built-in buttons |

### Methods

| Method | |
|---|---|
| `setData(candles)` | Replace the history |
| `prependData(candles)` | Add older candles |
| `tick({ time, price, volume? })` | A live trade or quote |
| `update(candle)` | A whole live candle |
| `addMarker(o)`, `addPriceLine(o)`, `addTimeLine(o)`, `addZone(o)` | Overlays; each returns an id |
| `updateOverlay(id, patch)`, `removeOverlay(id)`, `clearOverlays()` | Change or remove overlays |
| `addIndicator(id, params?)`, `updateIndicator(key, params)`, `removeIndicator(key)`, `indicatorList()` | Indicators in code |
| `setDrawingTool(tool \| null)` | `line`, `trend`, `horizontal`, `vertical`, `fib` |
| `drawings`, `setDrawings(list)`, `addDrawing(d)`, `updateDrawing(id, patch)`, `removeDrawing(id)`, `clearDrawings()` | Save, restore and edit drawings |
| `zoomIn()`, `zoomOut()`, `goLive()`, `fitContent()` | View |
| `chart` | The underlying `Chart` instance |

### Events

All events are `CustomEvent`s on the element, with the data in `detail`.

| Event | `detail` |
|---|---|
| `tl-requesthistory` | `{ before }`: the oldest loaded candle time. Load older candles. |
| `tl-crosshair` | `{ time, price, candle }`, or `null` when the pointer leaves |
| `tl-click` | `{ time, price, candle }` where the user clicked |
| `tl-rangechange` | The visible time range |
| `tl-followchange` | `{ following }`: whether the chart is following the live edge |
| `tl-zoomlimit` | `{ minCandles }`: zoomed in as far as allowed |
| `tl-indicatorschange` | The remaining indicators, after the user closes one |
| `tl-drawingschange` | All drawings, ready to save |
| `tl-drawingselect` | The selected drawing, or `null` |
| `tl-toolchange` | The active drawing tool, or `null` |

### Styling

Every colour is a CSS variable on the element:

```css
trade-chart {
  --tl-background: #0b0f17;
  --tl-grid: rgba(148, 163, 184, .07);
  --tl-text: #7d8799;
  --tl-up: #22c38e;
  --tl-down: #f0506e;
  --tl-accent: #4c9aff;  /* live price, buttons */
  --tl-line: #4c9aff;    /* line and area charts */
}
```

The full list is exported as `CSS_VARS`.

### Custom indicators

```js
import { registerIndicator, sma } from "tickline";

// a moving average of each candle's midpoint
registerIndicator({
  id: "mid",
  name: "Midpoint average",
  placement: "main", // or "pane" for its own pane
  params: [{ name: "period", default: 10, min: 1 }],
  compute: (candles, p) => ({
    lines: [{ name: "Mid", values: sma(candles.map((c) => (c.high + c.low) / 2), p.period), color: "#f5a524" }],
  }),
  label: (p) => `Mid ${p.period}`,
});

chart.addIndicator("mid", { period: 14 }); // or indicators="mid:14"
```

### Keyboard

← → pan · + − zoom · End back to live · Home fit all · Esc cancels drawing · Delete removes the selected drawing.

## Develop

```sh
npm ci
npm test          # unit tests
npm run typecheck
npm run build     # dist/
npm run site      # build, then copy the library into site/ for the demo page
```

Open `demo/dev.html` or `site/index.html` through any static server (for example `npx serve .`).

The demo page uses Binance's public market data for live crypto prices and falls back to simulated prices when that isn't reachable. Tickline itself doesn't fetch anything: you pass it your own data.

## Licence

MIT © Vong Visalsambath
