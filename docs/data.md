# Feeding data

Tickline doesn't fetch anything itself: your app gives it candles and prices from wherever they come from (REST, WebSocket, SignalR, Firebase, a test file).

## Candles

```ts
interface Candle {
  time: number;    // start of the candle, milliseconds since 1970 (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // needed for the volume indicator
}
```

`chart.setData(candles)` replaces the history. It:

- sorts by time, so order doesn't matter;
- groups candles into the chart's timeframe (several 1-minute candles become one 5-minute candle);
- merges candles with the same start time;
- skips candles with missing or non-numeric values.

Times in **seconds**? Multiply by 1000. Times as **strings**? Use `Date.parse(s)`.

## Live trades and quotes: `tick`

```js
chart.tick({ time: Date.now(), price: 68123.45, volume: 0.02 });
```

- A tick inside the current candle's time updates its close, high, low and volume.
- A tick after it starts a new candle (with gaps left empty).
- A tick older than the last one is ignored, so out-of-order messages can't corrupt the chart.

For quote feeds with bid and ask, pass the price you want to chart (often the bid, or the middle).

## Whole live candles: `update`

```js
chart.update({ time: 1793714700000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 42 });
```

A candle with the same start time as the last one replaces it; a newer one is added; an older one is ignored.

## Older history: `requesthistory`

When the user scrolls near the oldest candle, the chart asks for more:

```js
chart.addEventListener("tl-requesthistory", async (e) => {
  const older = await api.candles({ before: e.detail.before }); // candles that start before this time
  chart.prependData(older);
});
```

It asks once per oldest candle, so it won't flood your API while the user keeps dragging. If there's no more history, do nothing. How close to the edge it asks is `history.threshold`; turn requests off with `history: { request: false }`.

## Prices and decimals

Decimals are worked out from the price (68,123.45 → 2, 1.11942 → 5, 0.443085 → 6). Set them yourself with `precision`:

```html
<trade-chart precision="4"></trade-chart>
```

Numbers use English separators (68,123.45) unless you set a `locale` such as `de-DE` (68.123,45), or your own `format.price` function. See [Configuration](configuration.md#format).

## Time zones

Times are always UTC milliseconds in your data. The axis shows them in the user's local time by default. To show a fixed zone, set `timezone` in minutes from UTC:

```html
<trade-chart timezone="0"></trade-chart>     <!-- UTC -->
<trade-chart timezone="420"></trade-chart>   <!-- UTC+7, e.g. Phnom Penh, Bangkok -->
<trade-chart timezone="-300"></trade-chart>  <!-- UTC−5 -->
```

Candles are grouped on UTC boundaries (days start at 00:00 UTC, weeks on Monday, months on the 1st), the same way most exchanges and brokers do it.

## Timeframes

`"5s"`, `"1m"`, `"15m"`, `"1h"`, `"4h"`, `"1d"`, `"1w"`, `"1M"` (month), or any number with `s`, `m`, `h`, `d`, `w` or `M`.

Changing the timeframe regroups the candles the chart has, but only into a **larger** timeframe (1m → 5m works; 5m → 1m can't be made up). Load fresh history for the new timeframe:

```js
async function switchTimeframe(tf) {
  chart.setLoading(true);
  chart.setAttribute("timeframe", tf);  // or chart.setOptions({ timeframe: tf })
  chart.setData(await api.candles({ tf }));
  chart.setLoading(false);
}
```

## Switching symbols

```js
async function switchSymbol(symbol) {
  socket.close();
  chart.setLoading(true);                 // a striped placeholder while it loads
  chart.setAttribute("symbol", symbol);
  chart.clearOverlays();                  // positions and alerts belonged to the old symbol
  chart.setData(await api.candles({ symbol }));
  chart.setLoading(false);
  socket = openSocket(symbol);
}
```

Drawings are kept until you call `clearDrawings()` or `setDrawings(savedForThisSymbol)`; see [Several charts and saved charts](multiple-charts.md) for saving a chart per symbol.

## No live data

Without `tick` or `update`, it's a static chart of the history you gave it: no countdown or live marker, and the view isn't scrolled forward with the clock. A chart counts as live when its last candle ended less than three candles ago.

## Reading data back

`chart.data` returns every candle the chart holds, oldest first, after grouping.
