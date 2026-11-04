# Tickline documentation

Tickline is a live trading chart for websites and web apps. You add one `<trade-chart>` element (or create a `Chart` in code), give it candles, and stream prices to it. It draws candles, indicators, drawing tools, your users' positions and price alerts, and handles zoom, pan, touch, full screen and images.

## Start here

- **[Getting started](getting-started.md)**: install, the first chart, live prices, in five minutes.
- **[Feeding data](data.md)**: candles, live trades, whole candles, loading history page by page, time zones, switching symbols.

## Guides

- **[Configuration](configuration.md)**: every setting and its default.
- **[Overlays, shapes and drawings](drawing.md)**: positions, alerts, shapes from code, custom layers, the live-price marker, and the drawing tools.
- **[Indicators](indicators.md)**: the built-in indicators, styling them, and writing your own.
- **[Zoom and navigation](zoom.md)**: wheel, pinch, axis dragging, range buttons, and zooming from code.
- **[Animation](animation.md)**: speed, durations and easing for every animation.
- **[Styling and themes](styling.md)**: colours, fonts, CSS variables and the built-in buttons.
- **[Frameworks](frameworks.md)**: React, Next.js, Vue, Nuxt, Angular, Svelte, Blazor and plain HTML.
- **[Full screen and images](full-screen-and-images.md)**: full screen in portrait and landscape, and downloading the chart.
- **[Several charts and saved charts](multiple-charts.md)**: keeping charts in sync, saving and restoring a user's chart.
- **[Performance](performance.md)**: many charts, fast feeds, large histories.
- **[Accessibility](accessibility.md)**: keyboard, screen readers, reduced motion.
- **[Troubleshooting](troubleshooting.md)**: common problems and fixes.
- **[AI assistants](ai.md)**: the MCP server and the Claude Code skill.

## Reference

- **[API reference](api.md)**: every method, property, event and type.
- **[Changelog](../CHANGELOG.md)**
- **[Publishing](publishing.md)**: for maintainers releasing new versions.

## Browser support

Current versions of Chrome, Edge, Firefox and Safari on desktop, Android and iOS. It needs Canvas 2D and custom elements, which every browser from the last few years has. Without `ResizeObserver` it follows the window size instead, and where the browser can't show an element full screen (iPhone Safari) it covers the page.
