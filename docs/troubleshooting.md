# Troubleshooting

### The chart is empty or has no height

`<trade-chart>` is 420 px tall by default; inside a flex or grid parent it may be squeezed. Give it a height (`style="height: 480px"`, or `height: 100%` with a parent that has a height). A `Chart` needs its container to have a size.

### Candles are in the wrong place or the times look odd

Times must be **milliseconds** since 1970 (UTC). Seconds (10 digits) put everything in January 1970: multiply by 1000.

### The axis shows the wrong time zone

The axis uses the user's local time. Set `timezone="0"` for UTC, or minutes from UTC for another zone. See [Feeding data → Time zones](data.md#time-zones).

### Live prices don't move the chart

- Call `tick` (trades and quotes) or `update` (whole candles), not `setData`, for live data.
- Ticks older than the last one are ignored. Check your feed's times are in milliseconds and in order.
- The chart is "live" when its last candle ended less than three candles ago. If your history ends hours ago, the first tick starts a new candle at the current time.

### Changing the timeframe loses candles

Candles can be grouped into a larger timeframe but not split into a smaller one. Load history for the new timeframe; see [Feeding data → Timeframes](data.md#timeframes).

### `addMarker` (or another add… method) throws

Overlays, shapes, indicators and drawings need the element to be in the page first. Add the element, then call the method (in a framework, in the mounted / after-render hook). Methods such as `setData` and `setOptions` are fine to call earlier: they wait until it's in the page.

### TypeScript doesn't know `<trade-chart>` in JSX

Add the declaration from [Frameworks → React](frameworks.md#react-18-and-19). `document.querySelector("trade-chart")` is typed automatically.

### "HTMLElement is not defined" on the server

Importing `tickline` is safe on the server, so this comes from code that uses the chart while rendering on the server. Make sure the chart component renders in the browser only (`ssr: false` in Next.js, `<ClientOnly>` in Nuxt), and call chart methods in mounted / effect hooks.

### The page scrolls when I scroll over the chart (or doesn't)

The mouse wheel zooms the chart. To let the page scroll instead, set `interaction: { wheelZoom: false }`.

### Full screen doesn't open

Browsers only allow full screen in answer to a click or key press. Call `enterFullscreen()` from a click handler. On iPhone the chart covers the page instead of using the browser's full screen; that's expected.

### The downloaded image fails or is blank

An image shape from another site without CORS headers stops the browser from exporting the canvas. Serve the image from your own site or add `Access-Control-Allow-Origin`.

### Colours from CSS variables don't change

CSS variables are read when the chart starts and when its `theme` changes. After changing them later, set the `theme` attribute again (even to the same value), or use `setOptions({ theme: { … } })`.

### Indicators show nothing at the start

Moving averages need `period` candles before their first value. Load more history, or use a shorter period.

### The chart has no styling under a Content-Security-Policy

`<trade-chart>` styles its buttons with a `<style>` element inside its shadow root. A policy without `'unsafe-inline'` in `style-src` blocks that styling. The chart still draws, but its buttons lose their styling. Allow inline styles:

```
style-src 'self' 'unsafe-inline'
```

The chart doesn't need `script-src 'unsafe-inline'` or `'unsafe-eval'`. It needs `connect-src` only for the data feeds your own code opens. Saved images use `blob:` and `data:` URLs, so allow them in `img-src` if you show them on the page.

### Restoring a saved state drops some drawings or alerts

`setState` and `setDrawings` check what they restore, because a saved state can come from anywhere: storage, a link, another user. They skip anything that can't be drawn:

- drawings with an unknown tool, too few points, or a time or price that isn't a finite number;
- alerts whose price isn't a finite number;
- a view range whose ends aren't finite numbers.

They also limit what they keep:

- at most 2,000 drawings and 500 alerts;
- text cut to 500 characters, and alert labels to 100;
- widths limited to 0.5–20 px, and font sizes to 6–96 px.

### Still stuck?

[Open an issue](https://github.com/vongvisalsambath/tickline/issues) with your browser, a few lines of code and what you expected.
