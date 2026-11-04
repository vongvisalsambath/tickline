# Tickline reference (compact)

Full docs: https://tickline-chart.vercel.app/docs/ · API: https://tickline-chart.vercel.app/docs/api.html · Settings: https://tickline-chart.vercel.app/docs/configuration.html

## Exports

`Chart`, `TradeChartElement`, `defineTradeChart`, `syncCharts`, `defaultOptions`, `DEFAULT_LABELS`, `DARK`, `LIGHT`, `CSS_VARS`, `registerIndicator`, `getIndicator`, `listIndicators`, `sma`, `ema`, `rsi`, `stdev`, `parseTimeframe`, `bucketStart`, `heikinAshi`, `FIB_LEVELS`, `TOOL_NAMES`, and every type.

## Chart (and the same methods on trade-chart)

`new Chart(container, options?)`; property `canvas`.

- Data: `setData(candles)`, `prependData(candles)`, `tick({ time, price, volume? })`, `update(candle)`, `data`, `setLoading(on)`, `loading`
- Settings: `setOptions(options)`, `options`, `setType(type)`, `type`, `setTimeframe(tf)`, `timeframe`, `setTheme(theme)`, `currentTheme`, `drawingColor`
- Overlays (return ids): `addMarker({ time, price, side?, text?, color? })`, `addPriceLine({ price, color?, label?, style?, width?, from?, to?, axisLabel? })`, `addTimeLine({ time, color?, label?, style?, countdown? })`, `addZone({ from: price|"top", to: price|"bottom", color, start?, end? })`, `addAlert({ price, label?, color?, once? })`, `alerts`, `updateOverlay(id, patch)`, `removeOverlay(id)`, `clearOverlays()`
- Shapes and layers: `addShape(o)`, `shapes`, `addLayer(draw, { zIndex?, animate? })` → remove fn, `toScreen({ time, price })`, `fromScreen({ x, y })`
- Indicators: `addIndicator(id, params?, style?)` → key, `updateIndicator(key, params?, style?)`, `removeIndicator(key)`, `clearIndicators()`, `indicatorList`
- Drawings: `setDrawingTool(tool|null)`, `drawingTool`, `drawings`, `setDrawings(list)`, `addDrawing(d)`, `updateDrawing(id, patch)`, `duplicateDrawing(id)`, `removeDrawing(id)`, `clearDrawings()`, `selectedDrawing`
- View: `zoomIn()`, `zoomOut()`, `goLive()`, `isFollowing`, `fitContent()`, `visibleRange`, `setVisibleRange({ from, to }, { follow? })`, `scrollToTime(time, position?)`, `setCrosshair(time|null)`, `setRotation(0|90)`, `screenRotation`
- Images: `toBlob({ type?, quality?, pixelRatio?, crosshair? })`, `toDataURL(o?)`, `downloadImage(filename?, o?)`
- State: `getState()` → `{ version, type, timeframe, indicators, drawings, alerts, view }`, `setState(state)`
- Events: `on(name, fn)` → off fn, `off(name, fn)`; lifecycle `destroy()`

## trade-chart only

Properties: `chart`, `options` (assignable), `currentTheme`, `type`, `timeframe`, `symbol`, `data` (assignable), `drawings` (assignable), `selectedDrawing`, `drawingTool`, `isFullscreen`, `fullscreenOrientation`.
Methods: `enterFullscreen({ orientation?: "auto"|"landscape"|"portrait" })`, `exitFullscreen()`, `toggleFullscreen()`, `rotate()`, `editText(id)`.

## Events (element: `tl-` + name, data in `e.detail`; Chart: `on(name)`)

`requesthistory {before}`, `crosshair {time, price, candle}|null`, `click`, `rangechange {from, to}`, `followchange {following}`, `zoomlimit {minCandles}`, `indicatorschange`, `drawingschange`, `drawingcreate`, `drawingselect`, `toolchange`, `alert {id, price, direction, time, label}`, `fullscreenchange {fullscreen, orientation, rotated}` (element only).

## Attributes

`type` (candles, hollow, bars, heikin-ashi, line, area) · `timeframe` (5s, 1m, 15m, 1h, 4h, 1d, 1w, 1M) · `symbol` · `theme` (dark, light) · `precision` · `timezone` (local or minutes from UTC) · `locale` · `fps` · `font-size` · `indicators` · `countdown` · `price-line` (short, full, none) · `emphasis-digits` · `right-padding` · `min-visible-candles` · `animate` · `crosshair` (snap, free, hidden) · `grid` (both, horizontal, vertical, none) · `legend` · `controls` (none) · `drawing-tools` (false or a list) · `live-position` (center, "x y") · `watermark` · `live-marker` · `fullscreen-orientation` · `options` (JSON with any settings).

## Settings groups (setOptions)

Top level: `type`, `timeframe`, `symbol`, `precision`, `timezone`, `locale`, `fps`, `theme`. Shorthands: `animate`, `countdown`, `priceLine`, `rightPadding`, `minVisibleCandles`, `emphasisDigits`.

- `layout`: fontSize, timeAxisHeight, priceAxisMinWidth, paddingTop, paddingBottom, paneMaxShare, paneMinHeight, paneHeight
- `series`: candleWidth, wicks, lineWidth, highLowLabels
- `grid`: horizontal, vertical
- `priceScale`: visible, margin, includeIndicators, labelSpacing
- `timeScale`: visible, labelSpacing, rightPadding, defaultVisibleCandles, minVisibleCandles, maxVisibleCandles
- `crosshair`: mode (snap, free, hidden), style, labels
- `legend`: visible, symbol, ohlc, change, indicators
- `lastPrice`: line, tag, emphasisDigits, marker (pulse, ripple, radar, glow, dot, none, function), pulse, countdown, countdownDirection (down, up)
- `livePosition`: x, y (0–1 or null)
- `watermark`: text, color, fontSize
- `interaction`: pan, wheelZoom, pinchZoom, keyboard, doubleClickToLive, resizePanes, closeIndicators, editDrawings, zoomStep
- `animation`: enabled, priceSmoothing, scaleSmoothing
- `history`: request, threshold
- `drawings`: color, width, style, colors, fibLevels
- `format`: price(v, decimals), time(t, kind, tzOffset), countdown(ms), indicator(v)
- `labels`: every UI word, incl. `tools.*`; `{n}` in zoomLimit
- `ui`: zoomButtons, liveButton, drawingToolbar, drawingTools, drawingBar, zoomLimitMessage, screenshotButton, fullscreenButton, fullscreenOrientation, rotateButton

Theme keys (CSS var `--tl-` + kebab-case): background, grid, text, textStrong, axisLine, up, down, line, areaTop, areaBottom, accent, accentText, crosshair, pillBackground, pillText, overlayText, levelLine, font, monoFont.

## Shapes

`type`: line, arrow (2 points), circle (centre + `radius` px or edge point), ellipse, rect (2 corners), polygon (3+), path (n, `closed?`), text (1, `text`), image (1, `src`, `imageWidth`, `imageHeight`). Style: `color`, `fill`, `width`, `style`, `opacity`, `text`, `fontSize`, `fontWeight`, `textColor`, `background`, `align`, `baseline`, `headSize`, `zIndex` (below, above).

## Drawing tools

line, trend, arrow, horizontal, vertical, rect, circle, fib, measure, text. Drawing: `{ id, tool, points: [{ time, price }], color, width?, style?, locked?, hidden?, text?, fontSize? }`.

## Indicators

`sma(period 20)`, `ema(period 50)`, `bb(period 20, mult 2)`, `rsi(period 14)`, `macd(fast 12, slow 26, signal 9)`, `volume`. Style: `colors[]` (bb: upper, middle, lower; macd: macd, signal), `width`, `upColor`, `downColor`, `bandColor`, `levels[]`, `height`. Custom: `registerIndicator({ id, name, placement: "main"|"pane", params: [{ name, default, min?, max? }], compute(candles, p) → { lines: [{ name, values, color }], histogram?, band?, levels?, range? }, label(p) })`.

## React + TypeScript JSX declaration

```ts
import type { TradeChartElement } from "tickline";
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "trade-chart": React.DetailedHTMLProps<React.HTMLAttributes<TradeChartElement>, TradeChartElement> & Record<string, unknown>;
    }
  }
}
```
