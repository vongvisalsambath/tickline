# Zoom and navigation

Users can zoom with the mouse wheel, a trackpad, two fingers, the − ⌖ + buttons, the + and − keys, and by dragging the axes. You can do all of it from code, and add quick range buttons such as 1D and 1W.

## Ways to zoom

| How | What happens |
|---|---|
| Mouse wheel, trackpad pinch | Zooms around the pointer (around the live candle while following) |
| Two-finger pinch | Zooms around the fingers |
| − ⌖ + buttons, + and − keys | One step of `interaction.zoomStep` (default 1.6×) |
| Drag the **time axis** | Right zooms in, left zooms out |
| Drag the **price axis** | Down squeezes the prices together, up spreads them out. The price scale stops fitting itself until you reset it |
| Double-click the time axis | Back to the default zoom |
| Double-click the price axis | The price scale fits the prices in view again |
| Double-click the chart | Back to the live price |
| Home, End | Show all loaded candles, back to live |

While the price scale is set by hand, dragging the chart up and down moves through prices too.

Turn axis dragging off with `interaction: { axisScale: false }`, and the wheel with `interaction: { wheelZoom: false }`.

## The zoom buttons

The − ⌖ + buttons (with the image and full-screen buttons) show when the mouse is over the chart. On touch screens they stay visible, since there's no hover. Choose with `ui.controlsVisible`:

| Value | Mouse | Touch screen |
|---|---|---|
| `"auto"` (default) | On hover | Always |
| `"always"` | Always | Always |
| `"hover"` | On hover | After a tap on the chart |

```js
chart.setOptions({ ui: { controlsVisible: "always" } });
```

## Quick range buttons

Buttons that show a span of time up to the live price. They're off by default:

```html
<trade-chart range-buttons></trade-chart>
<trade-chart range-buttons="1h 4h 1D 1W All"></trade-chart>
```

```js
chart.setOptions({ ui: { rangeButtons: true, ranges: ["15m", "1h", "1D", "All"] } });
```

A range is a number and a unit: `s`, `m` (minutes), `h`, `D`, `W`, `M` (months, 30 days), `Y` (365 days), or `All` for every loaded candle. Units other than `m` and `M` ignore case. Style the bar with `trade-chart::part(range-buttons)`; its buttons' accessible names start with `labels.showRange`.

## From code

```js
chart.zoomIn();                    // one step
chart.zoomOut();
chart.zoomBy(2);                   // twice as much time; 0.5 is half
chart.zoomTo("1D");                // the last day, following the live price
chart.zoomTo("All");               // every loaded candle (same as fitContent)
chart.resetZoom();                 // default zoom and an automatic price scale
chart.goLive();                    // back to the live price
chart.scrollToTime(time, 0.5);     // put a time in the middle
chart.setVisibleRange({ from, to });

chart.setPriceRange({ min: 1.08, max: 1.12 }); // fix the price scale
chart.setPriceRange(null);                      // fit the prices again
chart.priceRange;                               // { min, max } now
chart.autoScale;                                // false while it's fixed
```

Each method that moves the view animates (see [Animation](animation.md)) and takes `{ animate: false }` to jump, or `{ duration }` for its own timing.

## Limits

Zoom stays between `timeScale.minVisibleCandles` (default 12) and `timeScale.maxVisibleCandles` (default 3000) candles across the chart. `zoomTo` and `fitContent` keep to these too, so `zoomTo("1Y")` on a 1-minute chart shows the last 3000 minutes. Raise `maxVisibleCandles` to see more at once; drawing takes longer the more candles are in view.

When the user tries to zoom in past the limit, the chart fires `tl-zoomlimit` and `<trade-chart>` shows `labels.zoomLimit` (turn that off with `ui.zoomLimitMessage: false`).
