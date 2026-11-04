# Several charts and saved charts

## Keeping charts in sync

`syncCharts` links charts so that scrolling, zooming and the crosshair on one moves the others. It suits layouts such as a price chart above an indicator chart, or the same market on two timeframes side by side.

```js
import { syncCharts } from "tickline";

const unlink = syncCharts([chartA, chartB, chartC]);              // range and crosshair
const unlinkRange = syncCharts([a, b], { crosshair: false });     // range only
unlink();                                                          // stop
```

It takes `<trade-chart>` elements (once they're in the page) or `Chart` objects. Charts are synced by **time**, so charts of different widths show the same time range, and while one follows the live price the others follow too.

With the script tag, it's `Tickline.syncCharts`.

## A grid of charts

Each `<trade-chart>` is independent, so a grid is just CSS:

```html
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 8px;">
  <trade-chart symbol="BTC/USDT" timeframe="1m" style="height: 320px"></trade-chart>
  <trade-chart symbol="ETH/USDT" timeframe="1m" style="height: 320px"></trade-chart>
  <trade-chart symbol="SOL/USDT" timeframe="1m" style="height: 320px"></trade-chart>
  <trade-chart symbol="BNB/USDT" timeframe="1m" style="height: 320px"></trade-chart>
</div>
```

Charts that are scrolled out of view stop drawing by themselves. See [Performance](performance.md) for many charts on one page.

## Saving and restoring a user's chart

`getState()` returns what the user changed, as plain JSON-safe data:

```ts
interface ChartState {
  version: 1;
  type: ChartType;                 // candles, line …
  timeframe: string;               // for information: setState doesn't change it
  indicators: { id: string; params: Record<string, number>; style: IndicatorStyle }[];
  drawings: Drawing[];
  alerts: AlertOptions[];
  view: { following: boolean; from?: number; to?: number };
}
```

```js
// save, e.g. per user and symbol
const key = `chart:${userId}:${symbol}`;
localStorage.setItem(key, JSON.stringify(chart.getState()));

// restore: load candles for the saved timeframe first, then the rest
const saved = JSON.parse(localStorage.getItem(key) ?? "null");
if (saved) {
  chart.setAttribute("timeframe", saved.timeframe);
  chart.setData(await api.candles({ symbol, tf: saved.timeframe }));
  chart.setState(saved);
}
```

`setState` replaces the parts you give it (indicators, drawings, alerts, view, type) and leaves the rest. Save on change by listening to `tl-drawingschange`, `tl-indicatorschange` and your own controls, or simply when the user leaves the page.

Shapes and overlays you add from code aren't part of the state: they come from your app's data (positions, orders), so recreate them from there.
