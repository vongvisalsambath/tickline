# API reference

Everything the `tickline` package exports, every method and property of `Chart` and `<trade-chart>`, every event, and the types they use. For settings, see [Configuration](configuration.md).

- [Exports](#exports)
- [`<trade-chart>`](#trade-chart)
- [`Chart`](#chart)
  - [Data](#data) · [Settings](#settings) · [Overlays and alerts](#overlays-and-alerts) · [Shapes and layers](#shapes-and-layers) · [Indicators](#indicators) · [Drawings](#drawings) · [View](#view) · [Images](#images) · [State](#state) · [Events](#events-on-chart) · [Lifecycle](#lifecycle)
- [Events](#events)
- [Functions](#functions)
- [Types](#types)

## Exports

```js
import {
  Chart, TradeChartElement, defineTradeChart, syncCharts,
  defaultOptions, DEFAULT_LABELS, DARK, LIGHT, CSS_VARS,
  registerIndicator, getIndicator, listIndicators, sma, ema, rsi, stdev,
  parseTimeframe, parseSpan, bucketStart, heikinAshi, FIB_LEVELS, TOOL_NAMES,
} from "tickline";
```

Importing the package registers `<trade-chart>` (in the browser; on the server it does nothing). With the script tag, all of these are on the global `Tickline`.

## `<trade-chart>`

The element wraps a `Chart` and adds the built-in buttons, full screen and the text editor. Its methods are the `Chart` methods below, plus the ones in this section.

### Attributes

Every attribute is listed in [Configuration → Attributes](configuration.md#attributes). Removing an attribute puts its setting back to the default.

### Properties

| Property | |
|---|---|
| `chart` | The `Chart` inside, or `null` before the element is in the page |
| `options` | Every setting (read); assigning an object is `setOptions(object)` |
| `currentTheme` | The colours and fonts in use |
| `type`, `timeframe`, `symbol` | Read and write the matching attributes |
| `data` | Every candle (read); assigning is `setData(candles)` |
| `drawings` | Every drawing (read); assigning is `setDrawings(list)` |
| `selectedDrawing`, `drawingTool` | The selected drawing and the tool being placed, or `null` |
| `indicatorList`, `alerts`, `shapes`, `visibleRange`, `priceRange`, `autoScale`, `historyState` | As on `Chart` |
| `isFullscreen` | Whether the chart fills the screen |
| `fullscreenOrientation` | `"auto"`, `"landscape"` or `"portrait"`: what full screen was asked for |

### Methods only on the element

| Method | |
|---|---|
| `enterFullscreen({ orientation? })` | Fill the screen. `orientation`: `"auto"` (default from `ui.fullscreenOrientation`), `"landscape"`, `"portrait"`. Returns a promise. Call from a click or key press |
| `exitFullscreen()` | Leave full screen |
| `toggleFullscreen()` | Enter or leave |
| `rotate()` | Switch full screen between landscape and portrait (enters full screen if needed) |
| `editText(id)` | Open the text editor on a text drawing |

### Before it's in the page

`setOptions`, `setData`, `prependData`, `tick`, `update`, `setDrawings`, `setDrawingTool`, `setState`, `setLoading`, `setHistoryLoader`, `reloadHistory`, `retryHistory`, `playIntro`, `zoomTo`, `setPriceRange`, `setVisibleRange`, `scrollToTime`, `updateOverlay`, `removeOverlay`, `clearOverlays`, `updateIndicator`, `removeIndicator`, `clearIndicators`, `updateDrawing`, `removeDrawing` and `clearDrawings` can be called before the element is added to the page: they run when it is. Methods that return an id (`addMarker`, `addShape`, `addIndicator`, `addDrawing` …) and `addLayer` need it in the page, and throw otherwise.

### `defineTradeChart(tag?)`

Registers the element under another tag name, e.g. `defineTradeChart("price-chart")`. Importing the package already registers `trade-chart`.

## `Chart`

```ts
new Chart(container: HTMLElement, options?: ChartOptions)
```

Creates a chart that fills `container` (give it a size). `options` is any [settings](configuration.md) object.

| Property | |
|---|---|
| `canvas` | The `<canvas>` element |

### Data

| Method or property | |
|---|---|
| `setData(candles: Candle[])` | Replace the history. Sorts, groups into the timeframe, merges duplicates |
| `prependData(candles: Candle[])` | Add older candles without moving the view. Returns how many were added |
| `setHistoryLoader(loader \| null)` | Load candles page by page: the latest page into an empty chart, older pages as the user scrolls back, with the loading shown in the chart. Reloads when the timeframe or symbol changes. See [Loading history page by page](data.md#loading-history-page-by-page) |
| `reloadHistory()` | Clear the candles and load the latest page again |
| `retryHistory()` | Try the last failed page again |
| `historyState` | `"idle"`, `"loading"`, `"error"` or `"end"` (no older data) |
| `tick({ time, price, volume? })` | A live trade or quote. Older than the last one is ignored |
| `update(candle: Candle)` | A whole live candle: replaces the last one with the same time, or adds a newer one |
| `data` | Every candle, oldest first |
| `setLoading(on: boolean)` | Show or hide the loading state inside the chart (placeholder candles when it's empty) |
| `playIntro()` | Play the intro animation again (see [Animation](animation.md)) |
| `loading` | Whether it's shown |

See [Feeding data](data.md).

### Settings

| Method or property | |
|---|---|
| `setOptions(options: ChartOptions)` | Change settings; groups merge with what's set |
| `options` | A copy of every setting, defaults included (`ResolvedOptions`) |
| `setType(type: ChartType)`, `type` | Chart type |
| `setTimeframe(tf: string)`, `timeframe` | Timeframe. Regroups candles into a larger timeframe; load fresh history for a smaller one |
| `setTheme(theme: ThemeInput \| Theme)` | `"dark"`, `"light"`, a full theme, or `{ base, …colours }` |
| `currentTheme` | The colours and fonts in use |
| `drawingColor` | Colour for new drawings (same as `options.drawings.color`) |

### Overlays and alerts

Each `add…` returns an id. See [Overlays](drawing.md#overlays).

| Method or property | |
|---|---|
| `addMarker(o: MarkerOptions)` | A labelled point |
| `addPriceLine(o: PriceLineOptions)` | A horizontal line at a price |
| `addTimeLine(o: TimeLineOptions)` | A vertical line at a time, with an optional countdown |
| `addZone(o: ZoneOptions)` | A shaded band |
| `addAlert(o: AlertOptions)` | A price alert; fires `alert` when crossed |
| `alerts` | Alerts still waiting, with their ids |
| `updateOverlay(id, patch)` | Change any overlay or shape (merged) |
| `removeOverlay(id)` | Remove one |
| `clearOverlays()` | Remove every overlay, alert and shape |

### Shapes and layers

See [Shapes](drawing.md#shapes) and [Layers](drawing.md#layers-draw-anything).

| Method or property | |
|---|---|
| `addShape(o: ShapeOptions)` | A line, arrow, circle, ellipse, rect, polygon, path, text or image. Returns an id |
| `shapes` | Every shape, with its id |
| `addLayer(draw, o?: LayerOptions)` | A function that draws on the canvas every frame. Returns a function that removes it |
| `toScreen({ time, price })` | Screen position (CSS px from the chart's top left) |
| `fromScreen({ x, y })` | Time and price at a screen position |

### Indicators

See [Indicators](indicators.md).

| Method or property | |
|---|---|
| `addIndicator(id, params?, style?)` | Add one. `params` by name (`{ period: 14 }`) or in order (`[12, 26, 9]`). Returns a key |
| `updateIndicator(key, params?, style?)` | Change its parameters and/or style |
| `removeIndicator(key)` | Remove one |
| `clearIndicators()` | Remove all |
| `indicatorList` | `IndicatorInfo[]`: `{ key, id, label, params, style, placement }` |

### Drawings

See [Drawings](drawing.md#drawings-the-users-tools).

| Method or property | |
|---|---|
| `setDrawingTool(tool \| null)` | Start placing a drawing, or stop |
| `drawingTool` | The tool being placed, or `null` |
| `drawings` | Copies of every drawing, safe to store as JSON |
| `setDrawings(list)` | Replace all drawings |
| `addDrawing(d)` | Add one from code; returns its id |
| `updateDrawing(id, patch)` | Change `color`, `width`, `style`, `locked`, `hidden`, `text` or `fontSize` |
| `duplicateDrawing(id)` | Copy one and select the copy; returns its id |
| `removeDrawing(id)` | Remove one |
| `clearDrawings()` | Remove all |
| `selectedDrawing` | The selected drawing, or `null` |

### View

| Method or property | |
|---|---|
Methods that move the view animate (see [Animation](animation.md)) and take a last argument `{ animate?: boolean, duration?: number }`: `animate: false` jumps, `duration` sets this call's length in ms. See [Zoom and navigation](zoom.md).

| Method or property | |
|---|---|
| `zoomIn(o?)`, `zoomOut(o?)` | One zoom step (`interaction.zoomStep`) |
| `zoomBy(factor, o?)` | Zoom by a factor: `2` shows twice as much time, `0.5` half |
| `zoomTo(range, o?)` | Show a span up to the live price: `"30m"`, `"4h"`, `"1D"`, `"1W"`, `"1M"`, `"1Y"`, or `"All"`. Throws on an unknown range |
| `resetZoom(o?)` | Default zoom (`timeScale.defaultVisibleCandles`) and an automatic price scale |
| `goLive(o?)` | Back to the live price, following it |
| `isFollowing` | Whether it's following the live price |
| `fitContent(o?)` | Show every loaded candle (up to `timeScale.maxVisibleCandles`) |
| `visibleRange` | `{ from, to }` in ms |
| `setVisibleRange({ from, to }, { follow?, animate?, duration? })` | Show this range; with `follow: true`, follow the live price at this zoom |
| `scrollToTime(time, position = 0.5, o?)` | Put `time` at `position` across the chart (0 left, 1 right) |
| `setPriceRange({ min, max } \| null)` | Fix the price scale (as dragging the price axis does), or fit the prices in view again with `null` |
| `priceRange` | `{ min, max }` on the price scale now |
| `autoScale` | `true` while the price scale fits the prices in view |
| `setCrosshair(time \| null)` | Show a vertical crosshair at a time (used by `syncCharts`) |
| `setRotation(0 \| 90)` | Tell the chart it's shown turned a quarter clockwise, so touches land right. `<trade-chart>` does this for landscape full screen |
| `screenRotation` | `0` or `90` |

### Images

See [Images](full-screen-and-images.md#images).

| Method | |
|---|---|
| `toBlob(o?: ImageOptions)` | A promise of an image `Blob` (PNG by default) |
| `toDataURL(o?: ImageOptions)` | A `data:` URL |
| `downloadImage(filename?, o?: ImageOptions)` | Download it (default name: symbol and timeframe) |

### State

See [Saved charts](multiple-charts.md#saving-and-restoring-a-users-chart).

| Method | |
|---|---|
| `getState()` | `ChartState`: type, timeframe, indicators, drawings, alerts and view, as JSON-safe data |
| `setState(state)` | Restore it; parts you leave out stay as they are |

### Events on `Chart`

```js
const off = chart.on("alert", (e) => console.log(e.price));
off();                      // or chart.off("alert", handler)
```

`on(name, handler)` adds a handler and returns a function that removes it; `off(name, handler)` removes it too. The names are the ones in [Events](#events) without `tl-`.

### Lifecycle

| Method | |
|---|---|
| `destroy()` | Stop drawing, remove listeners and the canvas. `<trade-chart>` calls it when it's removed from the page |

## Events

On `<trade-chart>` they're DOM `CustomEvent`s named `tl-…` that bubble, with the data in `event.detail`. On `Chart`, use `chart.on(name, …)` with the name without `tl-`.

| Event | `detail` | When |
|---|---|---|
| `tl-requesthistory` | `{ before, count, respondWith }` | The user scrolled near the oldest candle; load `count` candles before `before`. Call `respondWith(promise)` right away to have the chart show the loading state and add them, or call `prependData` yourself |
| `tl-historystate` | `{ state }` | History loading started (`"loading"`), finished (`"idle"`), failed (`"error"`) or reached the oldest data (`"end"`) |
| `tl-crosshair` | `CrosshairInfo` or `null` | The pointer moved over the chart, or left it |
| `tl-click` | `CrosshairInfo` | A click or tap on the chart (not a drag) |
| `tl-rangechange` | `VisibleRange` | The time range in view changed |
| `tl-followchange` | `{ following }` | Following the live price turned on or off |
| `tl-zoomlimit` | `{ minCandles }` | The user tried to zoom in past the limit |
| `tl-indicatorschange` | `IndicatorInfo[]` | The user closed an indicator (or `setState` replaced them) |
| `tl-drawingschange` | `Drawing[]` | A drawing was added, moved, changed or deleted |
| `tl-drawingcreate` | `Drawing` | The user finished placing a drawing |
| `tl-drawingselect` | `Drawing` or `null` | The selection changed |
| `tl-toolchange` | `DrawingTool` or `null` | The active drawing tool changed |
| `tl-alert` | `AlertEvent` | The price crossed an alert |
| `tl-fullscreenchange` | `{ fullscreen, orientation, rotated }` | Full screen started or ended, or the orientation changed (element only) |

## Functions

### `syncCharts(charts, options?)`

Links charts so scrolling, zooming and the crosshair move together. `charts`: `Chart` objects or `<trade-chart>` elements in the page. `options`: `{ range?: boolean, crosshair?: boolean }` (both default `true`). Returns a function that unlinks them. See [Several charts](multiple-charts.md).

### Indicator functions

| Function | |
|---|---|
| `registerIndicator(def: IndicatorDefinition)` | Add (or replace) an indicator |
| `getIndicator(id)` | Its definition, or `undefined` |
| `listIndicators()` | Every registered definition |
| `sma(values, period)`, `ema(values, period)`, `rsi(values, period)`, `stdev(values, period)` | Helpers returning a `Float64Array` (NaN before enough values) |

### Settings and themes

| Export | |
|---|---|
| `defaultOptions()` | A fresh `ResolvedOptions` with every default |
| `DEFAULT_LABELS` | The English labels |
| `DARK`, `LIGHT` | The theme presets |
| `CSS_VARS` | Theme key → CSS variable name, e.g. `CSS_VARS.up === "--tl-up"` |

### Time and data

| Export | |
|---|---|
| `parseTimeframe(tf)` | `{ ms, unit, count }`; throws on an unknown timeframe |
| `parseSpan(span)` | A range such as `"4h"`, `"1D"` or `"1M"` (30 days) in ms, or `null` |
| `bucketStart(time, parsed)` | The start of the candle containing `time` |
| `heikinAshi(candles)` | Heikin-Ashi candles from regular ones |
| `FIB_LEVELS` | The default Fibonacci levels |
| `TOOL_NAMES` | Drawing tool → English name |

## Types

All types are exported for TypeScript (`import type { … } from "tickline"`).

```ts
interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }
interface Tick { time: number; price: number; volume?: number }
interface ChartPoint { time: number; price: number }
type ChartType = "line" | "area" | "candles" | "hollow" | "bars" | "heikin-ashi";
type Timeframe = string; // "5s", "1m", "15m", "1h", "4h", "1d", "1w", "1M" …

interface MarkerOptions { time: number; price: number; side?: "buy" | "sell" | "neutral"; text?: string; color?: string }
interface PriceLineOptions {
  price: number; color?: string; label?: string; style?: "solid" | "dashed" | "dotted"; width?: number;
  from?: number; to?: number; axisLabel?: boolean;
}
interface TimeLineOptions { time: number; color?: string; label?: string; style?: "solid" | "dashed" | "dotted"; countdown?: boolean }
interface ZoneOptions { from: number | "top"; to: number | "bottom"; color: string; start?: number; end?: number }
interface AlertOptions { price: number; color?: string; label?: string; once?: boolean }
interface AlertEvent { id: string; price: number; direction: "up" | "down"; time: number; label?: string }

interface ShapeOptions {
  type: "line" | "arrow" | "circle" | "ellipse" | "rect" | "polygon" | "path" | "text" | "image";
  points: ChartPoint[];
  color?: string; fill?: string; width?: number; style?: "solid" | "dashed" | "dotted"; opacity?: number;
  radius?: number; headSize?: number; closed?: boolean;
  text?: string; fontSize?: number; fontWeight?: number | string; textColor?: string; background?: string;
  align?: "left" | "center" | "right"; baseline?: "top" | "middle" | "bottom";
  src?: string; imageWidth?: number; imageHeight?: number;
  zIndex?: "below" | "above";
}
interface LayerOptions { zIndex?: "below" | "above" | "top"; animate?: boolean }
interface LayerContext {
  timeToX(time: number): number; xToTime(x: number): number;
  priceToY(price: number): number; yToPrice(y: number): number;
  width: number; height: number; now: number; theme: Theme;
  live: { time: number; price: number; x: number; y: number } | null;
  range: VisibleRange; candles: readonly Candle[];
}
type LiveMarkerFn = (ctx: CanvasRenderingContext2D, info: { x: number; y: number; color: string; now: number; live: boolean; animated: boolean }) => void;

type DrawingTool = "line" | "trend" | "arrow" | "horizontal" | "vertical" | "rect" | "circle" | "fib" | "measure" | "text";
interface Drawing {
  id: string; tool: DrawingTool; points: ChartPoint[]; color: string;
  width?: number; style?: "solid" | "dashed" | "dotted"; locked?: boolean; hidden?: boolean; text?: string; fontSize?: number;
}

interface IndicatorStyle { colors?: string[]; width?: number; upColor?: string; downColor?: string; bandColor?: string; levels?: number[]; height?: number }
interface IndicatorInfo { key: string; id: string; label: string; params: Record<string, number>; style: IndicatorStyle; placement: "main" | "pane" }
interface IndicatorDefinition {
  id: string; name: string; placement: "main" | "pane";
  params: { name: string; default: number; min?: number; max?: number }[];
  compute(candles: readonly Candle[], params: Record<string, number>): IndicatorOutput;
  label(params: Record<string, number>): string;
  window?: boolean; // false: always compute over every candle (see history.indicatorWindow)
}

interface AnimateOptions { animate?: boolean; duration?: number }
interface HistoryRequest { before: number | null; count: number; timeframe: Timeframe; symbol: string; signal: AbortSignal | undefined }
type HistoryLoader = (req: HistoryRequest) => Promise<readonly Candle[]> | readonly Candle[];
type HistoryState = "idle" | "loading" | "error" | "end";
type Easing = "smooth" | "snappy" | "linear" | "bounce" | ((t: number) => number);

interface CrosshairInfo { time: number; price: number; candle: Candle | null }
interface VisibleRange { from: number; to: number }
interface ImageOptions { type?: "image/png" | "image/jpeg" | "image/webp"; quality?: number; pixelRatio?: number; crosshair?: boolean }
interface ChartState {
  version: 1; type: ChartType; timeframe: Timeframe;
  indicators: { id: string; params: Record<string, number>; style: IndicatorStyle }[];
  drawings: Drawing[]; alerts: AlertOptions[];
  view: { following: boolean; from?: number; to?: number };
}
type ThemeInput = "dark" | "light" | (Partial<Theme> & { base?: "dark" | "light" });
```

`ChartOptions` (every field optional) and `ResolvedOptions` (every field filled in) are described in [Configuration](configuration.md); the group types are exported as `LayoutOptions`, `SeriesOptions`, `GridOptions`, `PriceScaleOptions`, `TimeScaleOptions`, `CrosshairOptions`, `LegendOptions`, `LastPriceOptions`, `LivePositionOptions`, `WatermarkOptions`, `InteractionOptions`, `AnimationOptions` (with `AnimationDurations`), `HistoryOptions`, `DrawingOptions`, `FormatOptions`, `Labels` and `UiOptions`. `Theme` has the keys listed in [Configuration → theme](configuration.md#theme).
