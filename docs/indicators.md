# Indicators

## Built-in indicators

| Id | Name | Where | Parameters (defaults) |
|---|---|---|---|
| `sma` | Simple moving average | Over the price | `period` (20) |
| `ema` | Exponential moving average | Over the price | `period` (50) |
| `bb` | Bollinger Bands | Over the price | `period` (20), `mult` (2) |
| `rsi` | Relative strength index | Own pane, 0–100 | `period` (14) |
| `macd` | MACD | Own pane | `fast` (12), `slow` (26), `signal` (9) |
| `volume` | Volume | Own pane | none |

The math follows the usual conventions: EMA starts from the SMA of its first period, RSI uses Wilder's smoothing, MACD's histogram is MACD minus signal.

## Adding them

With the `indicators` attribute, parameters after colons in the order above:

```html
<trade-chart indicators="sma:20, ema:50, bb:20:2, rsi:14, macd:12:26:9, volume"></trade-chart>
```

Changing the attribute replaces the indicators it added; ones you add in code stay.

From code, with parameters by name or in order, and an optional style:

```js
const key = chart.addIndicator("rsi", { period: 21 });
chart.addIndicator("macd", [8, 21, 5]);
chart.addIndicator("ema", [200], { colors: ["#f5a524"], width: 2 });

chart.updateIndicator(key, { period: 14 });                // new parameters
chart.updateIndicator(key, undefined, { levels: [20, 80] }); // new style only
chart.removeIndicator(key);
chart.clearIndicators();
chart.indicatorList; // [{ key, id, label, params, style, placement }]
```

Parameters outside their allowed range are clamped (a period is at least 1 or 2, depending on the indicator).

## Styling one indicator

| Style | |
|---|---|
| `colors` | Colours of its lines, in order. MACD: `[macd, signal]`; Bollinger Bands: `[upper, middle, lower]` |
| `width` | Line width in px |
| `upColor`, `downColor` | Histogram bars (MACD, volume) |
| `bandColor` | Fill between the bands (Bollinger Bands) |
| `levels` | Reference lines instead of the defaults, e.g. `[20, 80]` for RSI |
| `height` | Starting height of its pane, as a share of the chart, e.g. `0.25` |

## Panes

Indicators with their own pane appear below the price, each with its own scale, a header with its values at the hovered candle, and a × to close it. Users can drag the line between panes to resize them. Panes take at most 75% of the height together (`layout.paneMaxShare`), and each is at least 48 px (`layout.paneMinHeight`).

When the user closes an indicator, `tl-indicatorschange` fires with the ones left, so you can update your own controls:

```js
chart.addEventListener("tl-indicatorschange", (e) => syncMyToggles(e.detail.map((i) => i.id)));
```

Hide the × with `interaction: { closeIndicators: false }`.

## Writing your own

Register an indicator once, then use it like a built-in one, in the attribute too.

```js
import { registerIndicator, sma, ema } from "tickline";

registerIndicator({
  id: "mid",
  name: "Midpoint average",
  placement: "main", // "main": over the price; "pane": its own pane
  params: [{ name: "period", default: 10, min: 1, max: 500 }],
  compute: (candles, p) => ({
    lines: [{ name: "Mid", values: sma(candles.map((c) => (c.high + c.low) / 2), p.period), color: "#f5a524" }],
  }),
  label: (p) => `Mid ${p.period}`,
});

chart.addIndicator("mid", { period: 14 }); // or indicators="mid:14"
```

`compute` gets every candle (oldest first) and the parameters, and returns one value per candle. Use `NaN` where there's no value yet (the start of a moving average). It runs again only when the data changes, not every frame.

What `compute` can return:

```ts
interface IndicatorOutput {
  lines: { name: string; values: Float64Array | number[]; color: string; width?: number }[];
  histogram?: { values: Float64Array; up: Uint8Array; upColor: string; downColor: string }; // bars from zero; up[i] picks the colour
  band?: { upper: number; lower: number; color: string };  // fill between two lines, by index
  levels?: number[];                                         // dashed reference lines
  range?: [number, number];                                  // a fixed scale for the pane (e.g. 0–100)
}
```

A pane indicator with a histogram and a level, e.g. a momentum oscillator:

```js
registerIndicator({
  id: "mom",
  name: "Momentum",
  placement: "pane",
  params: [{ name: "period", default: 10, min: 1 }],
  compute: (candles, p) => {
    const values = Float64Array.from(candles, (c, i) => (i >= p.period ? c.close - candles[i - p.period].close : NaN));
    const up = Uint8Array.from(values, (v) => (v >= 0 ? 1 : 0));
    return { lines: [], histogram: { values, up, upColor: "rgba(34,195,142,.6)", downColor: "rgba(240,80,110,.6)" }, levels: [0] };
  },
  label: (p) => `Mom ${p.period}`,
});
```

Helpers you can use: `sma`, `ema`, `rsi` and `stdev`, each taking a list of numbers and a period and returning a `Float64Array`. `listIndicators()` and `getIndicator(id)` return the registered definitions.
