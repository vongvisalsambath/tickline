# Full screen and images

## Full screen

The ⛶ button (shown when you hover the chart, or tap it on a touch screen) and the **F** key fill the screen with the chart. Esc or the button again leaves.

From code (`<trade-chart>` only):

```js
await chart.enterFullscreen();
await chart.exitFullscreen();
await chart.toggleFullscreen();
chart.isFullscreen; // true or false

chart.addEventListener("tl-fullscreenchange", (e) => {
  const { fullscreen, orientation, rotated } = e.detail;
});
```

Browsers only allow full screen in answer to a click or key press, so call these from a click handler.

**How it works:** where the browser can show an element full screen, it does. Where it can't (Safari on iPhone), the chart covers the whole page instead: fixed in place, above everything, with the page's scrolling paused and the screen's safe areas (the notch, the home bar) left clear. You don't need to do anything different for either.

## Portrait and landscape

By default, full screen follows the device: turn the phone and the chart turns with it. To ask for an orientation:

```js
await chart.enterFullscreen({ orientation: "landscape" }); // or "portrait", or "auto"
await chart.rotate();                                      // switch between landscape and portrait
chart.fullscreenOrientation;                               // what was asked for
```

```html
<trade-chart fullscreen-orientation="landscape"></trade-chart>
```

- **Android** (Chrome and others): the screen is locked to that orientation, as video apps do.
- **iPhone and iPad** (Safari can't lock the screen): if the phone is held the other way, the chart turns a quarter turn so it's shown in the orientation you asked for, and touches are mapped to match. Turning the phone afterwards straightens it again.
- **Desktop**: there's nothing to rotate, so it stays as it is.

On touch screens, full screen shows a rotate button next to the others. Hide it with `ui: { rotateButton: false }`, or hide full screen altogether with `ui: { fullscreenButton: false }`. See [Configuration → ui](configuration.md#ui).

## Responsive layout

The chart always fills its element and redraws when the element changes size (window resize, sidebar opening, device rotation). On small charts (narrower than 520 px or shorter than 420 px) the drawing tools fold into one pencil button and the Live button moves above the zoom buttons. The legend drops values that don't fit.

Make the element responsive with CSS as usual:

```css
trade-chart { height: min(70vh, 640px); min-height: 320px; }
@media (max-width: 600px) { trade-chart { height: 60vh; } }
```

## Images

The ⤓ button downloads the chart as a PNG named after the symbol and timeframe (`EUR-USD-1m.png`). From code:

```js
await chart.downloadImage();                                  // the default name
await chart.downloadImage("my-chart.png", { pixelRatio: 2 }); // sharper, for slides and retina screens

const blob = await chart.toBlob({ type: "image/jpeg", quality: 0.9 }); // to upload or share
const url = chart.toDataURL();                                          // a data: URL for an <img>
```

| Option | |
|---|---|
| `type` | `"image/png"` (default), `"image/jpeg"` or `"image/webp"` |
| `quality` | 0–1, for JPEG and WebP |
| `pixelRatio` | Pixels per CSS pixel (default: the screen's). 2 or 3 for print-quality images |
| `crosshair` | Include the crosshair (default `false`) |

The image is exactly what's drawn on the chart: candles, indicators, overlays, shapes, drawings, axes and legend. The HTML buttons aren't in it.

Sharing on phones:

```js
const file = new File([await chart.toBlob()], "chart.png", { type: "image/png" });
if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "My chart" });
```

Images from another site in [image shapes](drawing.md#shapes) need CORS headers; without them the browser refuses to export the chart.
