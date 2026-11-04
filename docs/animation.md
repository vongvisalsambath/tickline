# Animation

Almost everything on the chart moves smoothly: candles rise in when data first arrives, new candles widen in, zoom and scroll glide, the chart type cross-fades, indicator panes slide open and closed, price lines and markers fade in and out, and older candles fade in as they load. You control how fast all of it is, each kind on its own, and the easing.

## Speed

One number speeds up or slows down every animation, including the live-price glide and the price scale:

```js
chart.setOptions({ animation: { speed: 2 } });   // twice as fast
chart.setOptions({ animation: { speed: 0.5 } }); // half as fast
```

```html
<trade-chart animation-speed="1.5"></trade-chart>
```

`speed` goes from 0.05 to 20. Turn everything off with `animate: false` (or the `animate="false"` attribute).

## Each kind of animation

`animation.durations` sets how long each kind takes at speed 1, in milliseconds. `0` turns that one off and leaves the rest.

| Duration | Default | What moves |
|---|---|---|
| `intro` | `700` | Candles rise in from left to right when the chart gets its first data. Lines, areas and indicators draw in from the left; the live marker appears last |
| `newCandle` | `250` | A new candle widens in |
| `zoom` | `250` | Zoom buttons, + and − keys, the mouse wheel, `zoomIn`, `zoomOut`, `zoomBy`, `resetZoom`, arrow keys |
| `scroll` | `400` | `goLive`, the Live button, `scrollToTime`, `setVisibleRange`, `fitContent`, `zoomTo` and the range buttons |
| `typeChange` | `300` | Cross-fade between chart types |
| `overlays` | `200` | Price lines, markers, zones, alerts and shapes fading in and out (markers also drop into place) |
| `history` | `300` | A page of older candles fading in |
| `panes` | `250` | Indicator panes sliding open and closed; price indicators fading |

```js
// no intro, slower zoom, everything else as it was
chart.setOptions({ animation: { durations: { intro: 0, zoom: 400 } } });
```

Trackpad scrolling, dragging and pinching follow your fingers directly; they are never delayed by an animation. Charts linked with `syncCharts` follow each other without animating, so they stay in step.

## Easing

`animation.easing` shapes zoom, scroll, the intro and the fades:

| Easing | Feel |
|---|---|
| `"smooth"` (default) | Fast start, gentle stop |
| `"snappy"` | Quicker start, longer settle |
| `"linear"` | Even speed |
| `"bounce"` | Overshoots a little and settles back |
| a function | Your own: takes 0–1 (time) and returns 0–1 (progress) |

```js
chart.setOptions({ animation: { easing: (t) => t * t * (3 - 2 * t) } }); // smoothstep
```

## One call, its own timing

Every method that moves the view takes `{ animate?, duration? }`:

```js
chart.zoomIn({ animate: false });               // jump
chart.goLive({ duration: 900 });                // slow glide back to live (not scaled by speed)
chart.setVisibleRange({ from, to }, { animate: false });
```

## Replay the intro

```js
chart.playIntro();
```

The intro plays by itself when an empty chart gets candles (the first `setData`, or the first page from a [history loader](data.md#loading-history-page-by-page)). Calling `setData` again on a chart that has candles doesn't replay it.

## Live price and price scale

Two older settings shape the live movement. Both are divided by `speed`.

| Setting | Default | |
|---|---|---|
| `animation.priceSmoothing` | `110` | How quickly the drawn price catches up with the last trade, in ms |
| `animation.scaleSmoothing` | `140` | How quickly the price scale adjusts, in ms |

## Reduced motion

When the user's system asks for reduced motion, animation is off. If your app has its own motion setting and you have checked it, you can opt out with `animation: { respectReducedMotion: false }`.

## Images

`toBlob`, `toDataURL` and `downloadImage` finish any running animation first, so the image shows the finished chart.
