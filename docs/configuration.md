# Configuration

Every setting in Tickline lives in one options object. You can pass it in four ways, and they all do the same thing:

```js
// 1. The Chart class
const chart = new Chart(element, { timeframe: "5m", grid: { vertical: false } });

// 2. Later, on a Chart or a <trade-chart>: only what you pass changes
chart.setOptions({ crosshair: { mode: "free" } });

// 3. The options property of <trade-chart> (same as setOptions)
document.querySelector("trade-chart").options = { legend: { ohlc: false } };
```

```html
<!-- 4. As JSON in the options attribute: useful for server-rendered pages (Razor, PHP, Django, Rails) -->
<trade-chart options='{"timeScale": {"rightPadding": 0.1}, "labels": {"live": "Live"}}'></trade-chart>
```

The most common settings also have their own attributes (see [Attributes](#attributes)).

**How settings merge.** Groups merge with what is already set, so `{ grid: { vertical: false } }` turns off the vertical grid and leaves everything else alone. Lists (such as `drawings.colors`) and functions (such as `format.price`) are replaced, not merged. Values outside their range are clamped, for example `series.candleWidth` stays between 0.1 and 1.

**Reading settings.** `chart.options` returns every setting with its current value, defaults included. It's a copy, so changing it does nothing; use `setOptions` instead.

**Order on `<trade-chart>`.** When the element starts: defaults, then the `options` attribute, then the other attributes, then anything you passed to `setOptions` before it was in the page. After that, the last change wins, whichever way it was made. Removing an attribute puts that setting back to its default.

## Contents

- [General](#general)
- [layout](#layout): sizes and spacing
- [series](#series): candles and lines
- [grid](#grid)
- [priceScale](#pricescale)
- [timeScale](#timescale): zoom range and right padding
- [crosshair](#crosshair)
- [legend](#legend)
- [lastPrice](#lastprice): live price line, tag, pulse, countdown
- [interaction](#interaction): pan, zoom, keyboard, editing
- [animation](#animation)
- [history](#history): loading older candles
- [drawings](#drawings)
- [format](#format): your own number and date formats
- [labels](#labels): every piece of text, for translation
- [ui](#ui): the built-in buttons of `<trade-chart>`
- [theme](#theme): colours and fonts
- [Indicator styles](#indicator-styles)
- [Attributes](#attributes)
- [Recipes](#recipes)

## General

| Setting | Default | |
|---|---|---|
| `type` | `"candles"` | `candles`, `hollow`, `bars`, `heikin-ashi`, `line` or `area` |
| `timeframe` | `"1m"` | `5s`, `1m`, `15m`, `1h`, `4h`, `1d`, `1w`, `1M` and so on |
| `symbol` | `""` | Name shown in the legend |
| `precision` | `"auto"` | Decimals for prices; `"auto"` picks them from the price (68,123.45 → 2, 1.11942 → 5) |
| `timezone` | `"local"` | `"local"`, or minutes from UTC: `0` for UTC, `420` for UTC+7, `-300` for UTC−5 |
| `locale` | `""` | A locale such as `"de-DE"` or `"ja-JP"` for numbers and dates. `""` keeps the built-in format (68,123.45 and 3 Nov) |
| `fps` | `60` | Frame-rate cap while prices are moving (1–240). Lower it to save battery on dashboards with many charts |
| `theme` | `"dark"` | See [theme](#theme) |

Shorthands kept for convenience: `animate` (= `animation.enabled`), `countdown` (= `lastPrice.countdown`), `priceLine` (= `lastPrice.line`), `rightPadding` (= `timeScale.rightPadding`), `minVisibleCandles` (= `timeScale.minVisibleCandles`), `emphasisDigits` (= `lastPrice.emphasisDigits`).

## layout

| Setting | Default | |
|---|---|---|
| `layout.fontSize` | `11` | Base font size in px for axis labels and tags. The legend and pane text scale from it |
| `layout.timeAxisHeight` | `26` | Height of the time axis in px |
| `layout.priceAxisMinWidth` | `64` | Narrowest the price axis gets in px; it widens for long prices |
| `layout.paddingTop` | `34` | Space above the highest price, for the legend |
| `layout.paddingBottom` | `10` | Space below the lowest price |
| `layout.paneMaxShare` | `0.75` | Most of the height that indicator panes can take together (0–0.9) |
| `layout.paneMinHeight` | `48` | Smallest height of an indicator pane in px |
| `layout.paneHeight` | `0.22` | Starting height of a new indicator pane, as a share of the chart (volume starts at 0.16 or less) |

## series

| Setting | Default | |
|---|---|---|
| `series.candleWidth` | `0.72` | Candle body width as a share of its slot (0.1–1). Also used for histogram bars |
| `series.wicks` | `true` | Draw the high–low wicks |
| `series.lineWidth` | `2` | Line width in px for `line` and `area` charts |

Colours of candles and lines come from the [theme](#theme) (`up`, `down`, `line`, `areaTop`, `areaBottom`).

## grid

| Setting | Default | |
|---|---|---|
| `grid.horizontal` | `true` | A line at each price label |
| `grid.vertical` | `true` | A line at each time label |

The colour is the theme's `grid`.

## priceScale

| Setting | Default | |
|---|---|---|
| `priceScale.visible` | `true` | Show the price axis. Hidden, the chart uses the full width and the live tag and axis labels are hidden |
| `priceScale.margin` | `0.08` | Space kept above and below the visible prices, as a share of the range |
| `priceScale.includeIndicators` | `true` | Fit the scale to price-pane indicators too (moving averages, Bollinger Bands) |
| `priceScale.labelSpacing` | `64` | Smallest gap between price labels in px |

## timeScale

| Setting | Default | |
|---|---|---|
| `timeScale.visible` | `true` | Show the time axis |
| `timeScale.labelSpacing` | `110` | Smallest gap between time labels in px |
| `timeScale.rightPadding` | `0.2` | Empty space to the right of the live candle, as a share of the width (0–0.9) |
| `timeScale.defaultVisibleCandles` | `60` | Candles in view when data first loads |
| `timeScale.minVisibleCandles` | `12` | Fewest candles you can zoom in to. Reaching it fires `zoomlimit` |
| `timeScale.maxVisibleCandles` | `3000` | Most candles you can zoom out to |

## crosshair

| Setting | Default | |
|---|---|---|
| `crosshair.mode` | `"snap"` | `"snap"` to the middle of the candle, `"free"` to follow the pointer, or `"hidden"` (the `crosshair` event still fires) |
| `crosshair.style` | `"dashed"` | `"solid"`, `"dashed"` or `"dotted"` |
| `crosshair.labels` | `true` | Price and time tags on the axes |

The colours are the theme's `crosshair`, `pillBackground` and `pillText`.

## legend

| Setting | Default | |
|---|---|---|
| `legend.visible` | `true` | The whole legend at the top left |
| `legend.symbol` | `true` | Symbol and timeframe |
| `legend.ohlc` | `true` | Open, high, low and close of the hovered (or last) candle |
| `legend.change` | `true` | Change in % for that candle |
| `legend.indicators` | `true` | Second row with price-pane indicators, their values and a close button |

## lastPrice

| Setting | Default | |
|---|---|---|
| `lastPrice.line` | `"short"` | Dotted line at the live price: from the last candle to the axis (`"short"`), across the chart (`"full"`) or `"none"` |
| `lastPrice.tag` | `true` | The price tag on the axis |
| `lastPrice.emphasisDigits` | `3` | Trailing digits of the tag drawn larger, so small moves stand out. `0` turns it off |
| `lastPrice.pulse` | `true` | The glowing dot at the live price |
| `lastPrice.countdown` | `true` | Time left in the current candle, next to the live price (timeframes of 2 seconds or more) |

## interaction

| Setting | Default | |
|---|---|---|
| `interaction.pan` | `true` | Drag, swipe and arrow keys move through time |
| `interaction.wheelZoom` | `true` | Mouse wheel and trackpad zoom. With `false` the page scrolls normally over the chart |
| `interaction.pinchZoom` | `true` | Two-finger pinch zoom |
| `interaction.keyboard` | `true` | Keyboard shortcuts when the chart has focus |
| `interaction.doubleClickToLive` | `true` | Double-click goes back to the live edge |
| `interaction.resizePanes` | `true` | Drag the line between panes to resize them |
| `interaction.closeIndicators` | `true` | Show the × that closes an indicator |
| `interaction.editDrawings` | `true` | Select, move and delete drawings. With `false` they are display-only |
| `interaction.zoomStep` | `1.6` | How much one zoom step (buttons, + and −) changes the zoom |

Turn all of them off for a chart that only displays prices:

```js
chart.setOptions({ interaction: { pan: false, wheelZoom: false, pinchZoom: false, keyboard: false, doubleClickToLive: false } });
```

## animation

| Setting | Default | |
|---|---|---|
| `animation.enabled` | `true` | Smooth live price and price scale. Always off when the user's system asks for reduced motion |
| `animation.priceSmoothing` | `110` | How quickly the drawn price catches up with the last trade, in ms. Lower is snappier |
| `animation.scaleSmoothing` | `140` | How quickly the price scale adjusts, in ms |

## history

| Setting | Default | |
|---|---|---|
| `history.request` | `true` | Fire `requesthistory` when the user scrolls near the oldest candle |
| `history.threshold` | `0.25` | How near, as a share of the chart width |

## drawings

| Setting | Default | |
|---|---|---|
| `drawings.color` | `"#4c9aff"` | Colour of new drawings (also `chart.drawingColor`) |
| `drawings.width` | `1.5` | Line width of new drawings |
| `drawings.style` | `"solid"` | Line style of new drawings |
| `drawings.colors` | 6 colours | Colours offered when a drawing is selected (`<trade-chart>` only) |
| `drawings.fibLevels` | `[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]` | Fibonacci retracement levels |

## format

Your own formatting functions. Each one is optional; without it, the built-in format (or `locale`) is used.

| Setting | Called with | Used for |
|---|---|---|
| `format.price` | `(value, decimals)` | Price axis, legend, live tag, crosshair, price lines, drawings |
| `format.time` | `(time, kind, tzOffset)` | Time axis, crosshair and drawing tags |
| `format.countdown` | `(msLeft)` | Candle countdown and time-line countdowns |
| `format.indicator` | `(value)` | Values in indicator panes (volume, RSI, MACD) |

`kind` tells you which label is wanted: `"seconds"`, `"minutes"` (axis times), `"day"`, `"days"` (axis dates), `"month"`, `"crosshair"` or `"drawing"`. `tzOffset` is the chart's offset from UTC in minutes, already worked out for `timezone: "local"`.

```js
chart.setOptions({
  format: {
    price: (v, d) => "$" + v.toFixed(d),
    time: (t, kind, tz) => {
      const d = new Date(t + tz * 60_000); // shift, then read the UTC fields
      return kind === "seconds" || kind === "minutes"
        ? `${d.getUTCHours()}h${String(d.getUTCMinutes()).padStart(2, "0")}`
        : d.toISOString().slice(0, 10);
    },
    indicator: (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(1)),
  },
});
```

Functions can't go in the JSON `options` attribute; use `locale` there, or call `setOptions` from a script.

## labels

Every piece of text the chart shows, for translation. `{n}` in `zoomLimit` becomes the number of candles.

| Label | Default |
|---|---|
| `labels.chart` | `"Price chart"` (screen-reader name) |
| `labels.open`, `high`, `low`, `close` | `"O"`, `"H"`, `"L"`, `"C"` |
| `labels.zoomIn`, `zoomOut` | `"Zoom in"`, `"Zoom out"` |
| `labels.backToLive` | `"Back to live"` |
| `labels.live` | `"Live ▸"` |
| `labels.zoomLimit` | `"You're at the closest zoom ({n} candles). Pick a smaller timeframe to see more detail."` |
| `labels.drawingTools`, `selectedDrawing` | `"Drawing tools"`, `"Selected drawing"` |
| `labels.delete`, `deleteDrawing` | `"Delete"`, `"Delete drawing"` |
| `labels.color` | `"Colour"` |
| `labels.tools.line` … `tools.fib` | `"Line"`, `"Trend line"`, `"Horizontal line"`, `"Vertical line"`, `"Fibonacci retracement"` |

```js
chart.setOptions({
  locale: "es-ES",
  labels: {
    open: "A", high: "Máx", low: "Mín", close: "C",
    zoomIn: "Acercar", zoomOut: "Alejar", backToLive: "Volver al directo", live: "En directo ▸",
    zoomLimit: "Zoom máximo ({n} velas). Elige un intervalo menor para ver más detalle.",
    delete: "Borrar", tools: { trend: "Línea de tendencia" },
  },
});
```

Indicator names come from their definitions; register your own indicator to name it differently.

## ui

The HTML controls of `<trade-chart>`. The `Chart` class has no built-in buttons and ignores these.

| Setting | Default | |
|---|---|---|
| `ui.zoomButtons` | `true` | The − ⌖ + buttons that appear on hover |
| `ui.liveButton` | `true` | The "Live ▸" button that appears after scrolling back |
| `ui.drawingToolbar` | `true` | The drawing toolbar |
| `ui.drawingTools` | all five | Which tools it offers, in order: `["line", "trend", "horizontal", "vertical", "fib"]` |
| `ui.drawingBar` | `true` | Colours and Delete for the selected drawing |
| `ui.zoomLimitMessage` | `true` | The message at the closest zoom |

Each control has a `part` name for styling from outside: `chart`, `controls`, `live-button`, `drawing-tools`, `drawing-bar` and `toast`.

```css
trade-chart::part(drawing-tools) { top: 12px; }
trade-chart::part(live-button) { border-radius: 999px; }
```

## theme

`theme` is `"dark"` (default), `"light"`, or overrides on top of one of them:

```js
chart.setOptions({ theme: { base: "light", up: "#16a34a", down: "#dc2626", font: "Inter, sans-serif" } });
```

On `<trade-chart>`, every theme colour is also a CSS variable, so you can theme charts from your stylesheet. The order is: the preset (`theme` attribute), then CSS variables, then colours set with `setOptions`.

| Key | CSS variable | Used for |
|---|---|---|
| `background` | `--tl-background` | Chart background |
| `grid` | `--tl-grid` | Grid lines |
| `text` | `--tl-text` | Axis labels |
| `textStrong` | `--tl-text-strong` | Symbol, pane names, day boundaries |
| `axisLine` | `--tl-axis-line` | Axis and pane dividers |
| `up`, `down` | `--tl-up`, `--tl-down` | Rising and falling candles, markers |
| `line` | `--tl-line` | Line and area charts |
| `areaTop`, `areaBottom` | `--tl-area-top`, `--tl-area-bottom` | Area fill gradient |
| `accent` | `--tl-accent` | Live price, buttons |
| `accentText` | `--tl-accent-text` | Text on the accent colour |
| `crosshair` | `--tl-crosshair` | Crosshair lines |
| `pillBackground`, `pillText` | `--tl-pill-background`, `--tl-pill-text` | Crosshair tags |
| `overlayText` | `--tl-overlay-text` | Text on markers, price-line labels and drawing tags |
| `levelLine` | `--tl-level-line` | Reference levels in panes (RSI 30/70) |
| `font`, `monoFont` | `--tl-font`, `--tl-mono-font` | Text and numbers |

Two more variables style the HTML message: `--tl-toast-background` and `--tl-toast-text`. `chart.currentTheme` (or `element.currentTheme`) returns the colours in use.

## Indicator styles

`addIndicator(id, params, style)` takes a third argument for that one indicator:

| Style | |
|---|---|
| `colors` | Colours of its lines, in order. MACD: `[macd, signal]`; Bollinger Bands: `[upper, middle, lower]` |
| `width` | Line width in px |
| `upColor`, `downColor` | Histogram bars (MACD, volume) |
| `bandColor` | Fill between the bands (Bollinger Bands) |
| `levels` | Reference levels instead of the defaults, e.g. `[20, 80]` for RSI |
| `height` | Starting height of its pane, as a share of the chart |

```js
const rsi = chart.addIndicator("rsi", { period: 21 }, { colors: ["#f59e0b"], levels: [20, 50, 80], height: 0.18 });
chart.updateIndicator(rsi, undefined, { width: 2 }); // change the style later
```

`chart.indicatorList` reports each indicator's params and style, so you can save and restore a user's setup.

## Attributes

Attributes set the most common settings without any JavaScript.

| Attribute | Setting | Values |
|---|---|---|
| `type` | `type` | `candles`, `hollow`, `bars`, `heikin-ashi`, `line`, `area` |
| `timeframe` | `timeframe` | `1m`, `5m`, `1h`, `1d` … |
| `symbol` | `symbol` | Any text |
| `theme` | `theme` | `dark`, `light` |
| `precision` | `precision` | A number of decimals |
| `timezone` | `timezone` | `local` or minutes from UTC |
| `locale` | `locale` | `de-DE`, `fr-FR`, `ja-JP` … |
| `fps` | `fps` | 1–240 |
| `font-size` | `layout.fontSize` | px |
| `indicators` | – | `sma:20, ema:50, bb:20:2, rsi:14, macd:12:26:9, volume` |
| `countdown` | `lastPrice.countdown` | `false` hides it |
| `price-line` | `lastPrice.line` | `short`, `full`, `none` |
| `emphasis-digits` | `lastPrice.emphasisDigits` | 0–8 |
| `right-padding` | `timeScale.rightPadding` | 0–0.9 |
| `min-visible-candles` | `timeScale.minVisibleCandles` | A number |
| `animate` | `animation.enabled` | `false` turns animation off |
| `crosshair` | `crosshair.mode` | `snap`, `free`, `hidden` |
| `grid` | `grid` | `both`, `horizontal`, `vertical`, `none` |
| `legend` | `legend.visible` | `false` hides it |
| `controls` | `ui` | `none` hides every built-in button |
| `drawing-tools` | `ui.drawingTools` | `false` hides the toolbar, or a list such as `trend, horizontal, fib` |
| `options` | everything | JSON with any settings |

## Recipes

**A small sparkline** with no axes, legend or controls:

```html
<trade-chart type="area" legend="false" grid="none" controls="none" crosshair="hidden" style="height: 80px"
  options='{"priceScale": {"visible": false}, "timeScale": {"visible": false, "rightPadding": 0.02},
            "lastPrice": {"line": "none", "countdown": false}, "interaction": {"pan": false, "wheelZoom": false, "pinchZoom": false}}'>
</trade-chart>
```

**A chart that scrolls with the page** instead of zooming on the mouse wheel:

```js
chart.setOptions({ interaction: { wheelZoom: false } });
```

**Your brand colours:**

```css
trade-chart {
  --tl-background: #0f1115;
  --tl-up: #00c805;
  --tl-down: #ff5000;
  --tl-accent: #7c3aed;
  --tl-font: "Inter", sans-serif;
}
```

**Only some drawing tools, in your language:**

```html
<trade-chart drawing-tools="horizontal, trend" options='{"labels": {"tools": {"horizontal": "Niveau", "trend": "Tendance"}}}'></trade-chart>
```

**Save and restore a user's chart:**

```js
const saved = { options: { type: chart.options.type }, indicators: chart.indicatorList, drawings: chart.drawings };
localStorage.setItem("my-chart", JSON.stringify(saved));

// later
const s = JSON.parse(localStorage.getItem("my-chart"));
chart.setOptions(s.options);
s.indicators.forEach((i) => chart.addIndicator(i.id, i.params, i.style));
chart.setDrawings(s.drawings);
```
