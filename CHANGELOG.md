# Changelog

## 0.1.0 (unreleased)

The first release.

### The chart

- `<trade-chart>` element and `Chart` class: one canvas, HiDPI, smooth live prices with a gliding price, easing scale and candle countdown.
- Chart types: candles, hollow candles, bars, Heikin-Ashi, line, area. Timeframes from 5 seconds to months.
- Live data with `tick` and `update`, history with `setData` and `prependData`, older history on demand (`requesthistory`).
- Indicators: SMA, EMA, Bollinger Bands, RSI, MACD and volume, in resizable panes, with per-indicator styles and custom indicators.
- Overlays for positions: markers, price lines, time lines with countdowns, zones; price alerts.
- Shapes from code (line, arrow, circle, ellipse, rect, polygon, path, text, image) and custom drawing layers.
- Live-price markers: pulse, ripple, radar, glow, dot, none, or your own.
- Drawing tools: line, trend line, arrow, horizontal, vertical, rectangle, circle, Fibonacci retracement, measure and text, with lock, duplicate, hide, colours and JSON save and restore.
- Full screen on every device, in portrait or landscape; image download (PNG, JPEG, WebP).
- Live price at a fixed place on screen (`livePosition`), watermark, high/low labels, loading placeholder.
- Over 80 settings and every piece of text in one options object, with attributes and a JSON `options` attribute; translations and locale formatting.
- `syncCharts` for several charts; `getState` / `setState` to save a user's chart.
- Responsive from small phones to large screens; touch, keyboard and reduced-motion support; safe to import on the server.

### Tools

- `tickline-mcp`: MCP server for AI assistants.
- Claude Code plugin with a skill and the MCP server.
- Documentation site, framework examples, and release workflow with npm trusted publishing.
