# Tickline

A live trading chart for any website. One `<trade-chart>` tag gives you smooth real-time prices, candles, indicators, drawing tools and markers for your users' positions. It works in plain HTML, React, Vue, Angular, Blazor, or anything else that renders HTML.

**[Live demo and docs](https://tickline-chart.vercel.app)** · about 28 KB gzipped · no dependencies · MIT

- **Feels live.** The price eases between trades, the scale glides, and a countdown shows the time left in the candle.
- **Six chart types.** Candles, hollow candles, bars, Heikin-Ashi, line and area. Timeframes from 5 seconds to 1 month.
- **Indicators.** SMA, EMA, Bollinger Bands, RSI, MACD and volume, in resizable panes. Register your own.
- **Drawing tools.** Line, trend line, horizontal, vertical, rectangle, Fibonacci retracement and a measure tool (change, %, candles, time). Users can select, drag, recolour, lock, duplicate and delete them, and you can save and restore them as JSON.
- **Positions and alerts.** Markers, price lines, time lines with countdowns, and shaded zones show trades, orders and expiries. Price alerts fire an event when the price crosses them.
- **Images and full screen.** Download the chart as a PNG (or get a Blob to upload), and show it full screen on any device, including iPhone.
- **Live price where you want it.** Keep the live price in the centre of the screen, or at any position you choose.
- **Configure almost everything.** Sizes, fonts, grid, axes, crosshair, legend, zoom limits, gestures, animation, number and date formats, every colour and every word, through [one documented options object](docs/configuration.md).
- **Made for real use.** Responsive from small phones to large screens, touch and keyboard, HiDPI, light and dark themes. It pauses when hidden, caps the frame rate, loads older history on demand, keeps several charts in sync, and saves and restores a user's whole chart.
- **Works with AI assistants.** An [MCP server](mcp/README.md) lets Claude, Cursor or VS Code look up the docs and settings, check settings, and write the integration code for your framework.

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

### Images, full screen, alerts and more

```js
chart.downloadImage();                                  // EUR-USD-1m.png, without the crosshair
const blob = await chart.toBlob({ pixelRatio: 2 });     // sharp PNG to upload or share
chart.toggleFullscreen();                               // or the ⛶ button, or F

chart.setOptions({ livePosition: { x: 0.5, y: 0.5 } }); // live price in the centre of the screen

chart.addAlert({ price: 70_000, label: "70k" });
chart.addEventListener("tl-alert", (e) => notify(`Price went ${e.detail.direction} through ${e.detail.price}`));

chart.setLoading(true);                                 // while switching symbols
chart.setVisibleRange({ from: Date.parse("2026-11-03T09:00Z"), to: Date.parse("2026-11-03T12:00Z") });

localStorage.chart = JSON.stringify(chart.getState());  // the user's type, indicators, drawings, alerts and view
chart.setState(JSON.parse(localStorage.chart));
```

Keep several charts in step (scroll, zoom and crosshair), for example a price chart above an indicator chart:

```js
import { syncCharts } from "tickline";
const unlink = syncCharts([chartA, chartB]);
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

## Configuration

Almost everything can be changed: sizes, fonts, grid, axes, crosshair, legend, the live price line and tag, zoom limits, pan and zoom behaviour, animation speed, drawing defaults, number and date formats, every piece of text (for translation), which built-in buttons appear, and every colour.

It's all one options object, which merges with what's already set:

```js
chart.setOptions({
  locale: "de-DE",                                   // 68.123,45 and German dates
  grid: { vertical: false },
  crosshair: { mode: "free" },
  timeScale: { rightPadding: 0.1, minVisibleCandles: 20 },
  lastPrice: { line: "full", countdown: false },
  interaction: { wheelZoom: false },                 // let the page scroll over the chart
  labels: { live: "Live", zoomIn: "Vergrößern" },
  theme: { base: "light", up: "#16a34a", down: "#dc2626" },
});

chart.options; // every setting with its current value
```

Without JavaScript, use attributes for common settings, or put any settings in the `options` attribute as JSON:

```html
<trade-chart locale="de-DE" grid="horizontal" crosshair="free" drawing-tools="trend, horizontal"
             options='{"lastPrice": {"line": "full"}, "labels": {"live": "Live"}}'></trade-chart>
```

**[Every setting, its default and examples → docs/configuration.md](docs/configuration.md)**

| Group | What it controls |
|---|---|
| General | `type`, `timeframe`, `symbol`, `precision`, `timezone`, `locale`, `fps`, `theme` |
| `layout` | Font size, axis sizes, padding, indicator pane sizes |
| `series` | Candle width, wicks, line width |
| `grid` | Horizontal and vertical lines |
| `priceScale` | Show or hide, margins, label spacing, whether indicators affect the scale |
| `timeScale` | Show or hide, label spacing, right padding, default, fewest and most candles in view |
| `crosshair` | Snap, free or hidden; line style; axis tags |
| `legend` | Symbol, OHLC, change, indicator row |
| `lastPrice` | Price line, axis tag, emphasised digits, pulse, countdown (down or up) |
| `livePosition` | Keep the live price at a fixed place on screen, e.g. the centre |
| `watermark` | Faint text behind the candles |
| `interaction` | Pan, wheel zoom, pinch zoom, keyboard, double-click, pane resizing, closing indicators, editing drawings, zoom step |
| `animation` | On or off, price and scale smoothing |
| `history` | When to ask for older candles |
| `drawings` | Default colour, width and style; colour palette; Fibonacci levels |
| `format` | Your own functions for prices, times, countdowns and indicator values |
| `labels` | Every piece of text, for translation |
| `ui` | Which built-in buttons `<trade-chart>` shows (zoom, live, image, full screen), and which drawing tools |

### Attributes

| Attribute | Values |
|---|---|
| `type` | `candles` (default), `hollow`, `bars`, `heikin-ashi`, `line`, `area` |
| `timeframe` | `5s`, `1m`, `15m`, `1h`, `4h`, `1d`, `1w`, `1M` and so on |
| `symbol` | Name in the legend |
| `theme` | `dark` (default) or `light` |
| `indicators` | Comma-separated, with optional parameters: `sma:20, ema:50, bb:20:2, rsi:14, macd:12:26:9, volume` |
| `precision` | Price decimals (default: worked out from the data) |
| `timezone` | `local` (default) or minutes from UTC, for example `420` |
| `locale` | `de-DE`, `fr-FR`, `ja-JP` … for numbers and dates (default: built-in English format) |
| `font-size` | Base font size in px (default 11) |
| `fps` | Frame-rate cap (default 60) |
| `price-line` | `short` (default), `full` or `none` |
| `countdown` | `false` hides the candle timer |
| `emphasis-digits` | Trailing digits of the live price drawn larger (default 3) |
| `right-padding` | Space to the right of the live candle, as a share of the width (default 0.2) |
| `min-visible-candles` | Fewest candles you can zoom in to (default 12) |
| `animate` | `false` turns animation off |
| `crosshair` | `snap` (default), `free` or `hidden` |
| `grid` | `both` (default), `horizontal`, `vertical` or `none` |
| `legend` | `false` hides the legend |
| `drawing-tools` | `false` hides the toolbar, or a list such as `trend, horizontal, fib` |
| `live-position` | `center`, or x and y shares such as `0.8 0.5` |
| `watermark` | Faint text behind the candles, e.g. `{symbol}` |
| `controls` | `none` hides all built-in buttons |
| `options` | Any settings, as JSON |

### Methods

| Method | |
|---|---|
| `setData(candles)` | Replace the history |
| `prependData(candles)` | Add older candles |
| `tick({ time, price, volume? })` | A live trade or quote |
| `update(candle)` | A whole live candle |
| `addMarker(o)`, `addPriceLine(o)`, `addTimeLine(o)`, `addZone(o)` | Overlays; each returns an id |
| `updateOverlay(id, patch)`, `removeOverlay(id)`, `clearOverlays()` | Change or remove overlays |
| `setOptions(options)`, `options` | Change settings; read every setting ([guide](docs/configuration.md)) |
| `addIndicator(id, params?, style?)`, `updateIndicator(key, params?, style?)`, `removeIndicator(key)`, `clearIndicators()`, `indicatorList` | Indicators in code, with optional colours, width, levels and pane height |
| `addAlert({ price, label?, color?, once? })`, `alerts` | Price alerts; `tl-alert` fires when the price crosses one |
| `setDrawingTool(tool \| null)` | `line`, `trend`, `horizontal`, `vertical`, `rect`, `fib`, `measure` |
| `drawings`, `setDrawings(list)`, `addDrawing(d)`, `updateDrawing(id, patch)`, `duplicateDrawing(id)`, `removeDrawing(id)`, `clearDrawings()` | Save, restore and edit drawings (`locked`, `hidden`, colour, width, style) |
| `zoomIn()`, `zoomOut()`, `goLive()`, `fitContent()` | View |
| `visibleRange`, `setVisibleRange({ from, to }, { follow? })`, `scrollToTime(time, position?)` | Read or set the time range in view |
| `downloadImage(filename?, options?)`, `toBlob(options?)`, `toDataURL(options?)` | The chart as an image (`type`, `quality`, `pixelRatio`) |
| `enterFullscreen()`, `exitFullscreen()`, `toggleFullscreen()`, `isFullscreen` | Full screen (`<trade-chart>`; falls back to covering the page where the browser can't) |
| `setLoading(on)` | A "Loading…" placeholder while you fetch data |
| `getState()`, `setState(state)` | A user's chart (type, indicators, drawings, alerts, view) as JSON |
| `currentTheme` | The colours and fonts in use |
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
| `tl-alert` | `{ id, price, direction, time, label }`: the price crossed an alert |
| `tl-fullscreenchange` | `{ fullscreen }` |

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

The full list (including fonts, crosshair tags and pane levels) is in the [configuration guide](docs/configuration.md#theme) and exported as `CSS_VARS`. From JavaScript: `setOptions({ theme: { base: "light", up: "#16a34a" } })`. The built-in buttons can be styled with `::part()`: `controls`, `live-button`, `drawing-tools`, `drawing-bar`, `toast`.

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

← → pan · + − zoom · End back to live · Home fit all · Esc cancels drawing · Delete removes the selected drawing. F toggles full screen. Turn shortcuts off with `interaction: { keyboard: false }`.

## AI assistants (MCP)

`tickline-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server. Add it to Claude Code, Claude Desktop, Cursor or VS Code, and your assistant can look up Tickline's docs and settings, check a settings object, and write the integration code for your framework and data source.

```sh
claude mcp add tickline -- npx -y tickline-mcp
```

Setup for other apps and the list of tools: [mcp/README.md](mcp/README.md).

## Develop

```sh
npm ci
npm test          # builds the MCP server, then runs the unit tests
npm run typecheck
npm run build     # dist/
npm run site      # build, then copy the library into site/ for the demo page
npm run build:mcp # mcp/dist/tickline-mcp.js
```

Open `demo/dev.html` or `site/index.html` through any static server (for example `npx serve .`).

The demo page uses Binance's public market data for live crypto prices and falls back to simulated prices when that isn't reachable. Tickline itself doesn't fetch anything: you pass it your own data.

## Licence

MIT © Vong Visalsambath
