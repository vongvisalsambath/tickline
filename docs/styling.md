# Styling and themes

## Light and dark

```html
<trade-chart theme="light"></trade-chart>   <!-- "dark" is the default -->
```

## Your colours

Every colour and both fonts are CSS variables on the element, so you can theme charts from your stylesheet, including per page or per dark-mode media query:

```css
trade-chart {
  --tl-background: #0f1115;
  --tl-up: #00c805;
  --tl-down: #ff5000;
  --tl-accent: #7c3aed;
  --tl-font: "Inter", system-ui, sans-serif;
}
@media (prefers-color-scheme: light) {
  trade-chart { --tl-background: #ffffff; }
}
```

Or from JavaScript, on top of a preset:

```js
chart.setOptions({ theme: { base: "light", up: "#16a34a", down: "#dc2626" } });
```

The order is: the preset (the `theme` attribute), then CSS variables, then colours from `setOptions`. CSS variables are read when the element starts and when `theme` changes; after changing them later, set the `theme` attribute again to apply them.

All the colours, their CSS variables and what they're used for are listed in [Configuration → theme](configuration.md#theme). `chart.currentTheme` returns the colours in use. The presets are exported as `DARK` and `LIGHT`, and `CSS_VARS` maps each key to its variable name.

## Sizes and text

- **Height**: set it on the element (`style="height: 480px"`, `height: 60vh`, or from your grid). It fills its width.
- **Text size**: `font-size="13"` (or `layout.fontSize`) scales the axis labels, tags and legend together.
- **Spacing and axes**: the [`layout`, `priceScale` and `timeScale` settings](configuration.md#layout).
- **Candles**: width and wicks in [`series`](configuration.md#series).

## The built-in buttons

The buttons are HTML inside the element's shadow DOM, and each part can be styled from outside with `::part()`:

| Part | |
|---|---|
| `chart` | The area holding the canvas and buttons |
| `controls` | Zoom, back-to-live, image, full screen and rotate |
| `live-button` | "Live ▸", shown after scrolling back |
| `drawing-tools` | The drawing toolbar |
| `drawing-bar` | Colours, Lock, Duplicate and Delete for the selected drawing |
| `text-editor` | The box for typing a text drawing |
| `toast` | Messages such as the zoom limit |

```css
trade-chart::part(drawing-tools) { top: 12px; }
trade-chart::part(live-button) { border-radius: 999px; }
trade-chart::part(toast) { font-size: 14px; }
```

The buttons also follow `--tl-background`, `--tl-text-strong`, `--tl-axis-line` and `--tl-accent`. The message colours are `--tl-toast-background` and `--tl-toast-text`.

Hide buttons with the [`ui` settings](configuration.md#ui), or all of them with `controls="none"`.

## Watermark

```html
<trade-chart symbol="EUR/USD" watermark="{symbol}"></trade-chart>
```

See [Configuration → watermark](configuration.md#watermark) for colour and size.

## Translations

Every word the chart shows is in `labels`, and `locale` sets number and date formats. See [Configuration → labels](configuration.md#labels).
