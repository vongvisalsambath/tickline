# Overlays, shapes and drawings

There are four ways to put things on the chart:

| | For | Made by |
|---|---|---|
| **Overlays** | Trading information: positions, orders, expiries, alerts | Your code |
| **Shapes** | Anything else you want to mark: circles, arrows, text, images, polygons | Your code |
| **Layers** | Anything at all, drawn with the canvas yourself, animated if you like | Your code |
| **Drawings** | Lines and shapes the user draws with the toolbar | The user (or your code) |

Everything is pinned to **time and price**, so it scrolls and zooms with the candles. Every `add…` method returns an id.

## Overlays

### Markers

A dot on a price with a label, e.g. where a trade was opened.

```js
const id = chart.addMarker({ time: Date.now(), price: 68123.45, side: "buy", text: "$10" });
```

| Option | |
|---|---|
| `time`, `price` | Where |
| `side` | `"buy"` (▲, up colour, label below), `"sell"` (▼, down colour, label above) or `"neutral"` |
| `text` | The label |
| `color` | Overrides the side's colour |

### Price lines

A horizontal line at a price, e.g. an entry, a stop or a target.

```js
chart.addPriceLine({ price: 68123.45, color: "#22c38e", label: "Entry", from: Date.now(), to: expiry, style: "dashed" });
```

| Option | |
|---|---|
| `price` | Where |
| `color`, `width`, `style` | Look (`"solid"`, `"dashed"` default, `"dotted"`) |
| `label` | A tag at the start of the line |
| `from`, `to` | Only between these times (default: across the chart) |
| `axisLabel` | The price tag on the axis (default `true`) |

### Time lines

A vertical line at a time, e.g. an expiry, with an optional countdown.

```js
chart.addTimeLine({ time: expiry, countdown: true, label: "Expiry" });
```

| Option | |
|---|---|
| `time` | Where |
| `label` | A tag at the top |
| `countdown` | Show the time left until `time` |
| `color`, `style` | Look |

### Zones

A shaded band: above or below a price, or between two, optionally between two times.

```js
chart.addZone({ from: "top", to: entry, start: now, end: expiry, color: "rgba(34,195,142,.08)" }); // wins above the entry
```

`from` is a price or `"top"`; `to` is a price or `"bottom"`; `start` and `end` are times.

### Price alerts

A line that fires an event when the price crosses it.

```js
chart.addAlert({ price: 70_000, label: "70k" });
chart.addEventListener("tl-alert", (e) => {
  const { price, direction, time, label } = e.detail; // direction: "up" or "down"
  showNotification(`BTC went ${direction} through ${price}`);
});
```

By default an alert is removed once it fires; `once: false` keeps it. `chart.alerts` lists the alerts still waiting.

### Changing and removing overlays

```js
chart.updateOverlay(id, { price: 68200 });  // any options, merged
chart.removeOverlay(id);
chart.clearOverlays();                       // everything added with add…, including shapes and alerts
```

### Example: a position from entry to expiry

```js
function showPosition({ side, entry, amount, openedAt, expiresAt }) {
  const up = side === "buy";
  const color = up ? "#22c38e" : "#f0506e";
  const ids = [
    chart.addZone({ from: up ? "top" : entry, to: up ? entry : "bottom", start: openedAt, end: expiresAt, color: up ? "rgba(34,195,142,.08)" : "rgba(240,80,110,.08)" }),
    chart.addPriceLine({ price: entry, from: openedAt, to: expiresAt, color, axisLabel: false }),
    chart.addTimeLine({ time: expiresAt, countdown: true, color }),
    chart.addMarker({ time: openedAt, price: entry, side, text: `$${amount}` }),
  ];
  return () => ids.forEach((id) => chart.removeOverlay(id)); // call when the position closes
}
```

The demo site's practice positions work this way, with the marker text updated to show the profit or loss.

## Shapes

Shapes mark anything else, from code: a circle round a swing high, an arrow, a note, a logo.

```js
chart.addShape({ type: "circle", points: [{ time, price }], radius: 14, color: "#f5a524", fill: "rgba(245,165,36,.15)", text: "Swing high" });
chart.addShape({ type: "arrow", points: [a, b], color: "#22c38e", width: 2 });
chart.addShape({ type: "text", points: [{ time, price }], text: "Breakout\nvolume ↑", background: "#4c9aff" });
chart.addShape({ type: "image", points: [{ time, price }], src: "/icons/news.svg", imageWidth: 20, imageHeight: 20, text: "CPI" });
```

| Type | Points |
|---|---|
| `line` | Two |
| `arrow` | Two; the head is at the second |
| `circle` | The centre, plus `radius` in px or a second point on the edge |
| `ellipse` | Two opposite corners of the box it fits in |
| `rect` | Two opposite corners |
| `polygon` | Three or more; closed |
| `path` | Any number; open unless `closed: true` |
| `text` | One anchor |
| `image` | One anchor (the image is centred on it unless you set `align` / `baseline`) |

| Option | |
|---|---|
| `color`, `width`, `style`, `opacity` | The line (default: theme accent, 1.5 px, solid, 1). `width: 0` draws no line |
| `fill` | Fill for circle, ellipse, rect, polygon and closed paths |
| `text` | The text of a text shape, or a label beside any other shape. `\n` starts a new line |
| `fontSize`, `fontWeight`, `textColor`, `background` | Text look; `background` draws a rounded tag behind it |
| `align`, `baseline` | Where text and images sit against their point |
| `radius`, `headSize`, `closed` | Circle radius (px), arrow head size (px), closed path |
| `src`, `imageWidth`, `imageHeight` | Image URL and size in px (default 24 × 24) |
| `zIndex` | `"above"` the candles (default) or `"below"` them |

Change shapes with `updateOverlay(id, patch)` and remove them with `removeOverlay(id)`. `chart.shapes` lists them.

Images from another site need CORS headers (`Access-Control-Allow-Origin`), or downloading the chart as an image will fail.

## Layers: draw anything

A layer is a function that draws on the chart's canvas every time it's drawn. Use it for anything shapes don't cover: heat maps, order-book depth, custom indicators, animations.

```js
const remove = chart.addLayer((ctx, { timeToX, priceToY, width, height, live, candles, theme, now }) => {
  // highlight candles with unusual volume
  for (const c of candles) {
    if ((c.volume ?? 0) < 1000) continue;
    const x = timeToX(c.time);
    ctx.fillStyle = "rgba(245,165,36,.12)";
    ctx.fillRect(x, 0, timeToX(c.time + 60_000) - x, height);
  }
}, { zIndex: "below" });

remove(); // later
```

What the function gets:

| | |
|---|---|
| `ctx` | The canvas 2D context, in CSS pixels, clipped to the price pane (unless `zIndex: "top"`). It's saved and restored around your function |
| `timeToX`, `xToTime`, `priceToY`, `yToPrice` | Turn time and price into screen positions and back |
| `width`, `height` | Size of the price pane's plot area |
| `live` | `{ time, price, x, y }` of the live price, or `null` |
| `candles` | The candles in view |
| `range` | The time range in view |
| `theme` | The colours and fonts in use |
| `now` | A clock in ms, for animation |

| Layer option | |
|---|---|
| `zIndex` | `"below"` the candles, `"above"` them (default), or `"top"` over everything, axes included |
| `animate` | Redraw every frame (for animations). Leave it off for still drawings, to save battery |

Example: an animated band that breathes around the live price.

```js
chart.addLayer((ctx, { live, width, now }) => {
  if (!live) return;
  const h = 18 + Math.sin(now / 500) * 6;
  ctx.fillStyle = "rgba(76,154,255,.07)";
  ctx.fillRect(0, live.y - h, width, h * 2);
}, { zIndex: "below", animate: true });
```

Outside a layer, `chart.toScreen({ time, price })` and `chart.fromScreen({ x, y })` do the same conversions, e.g. to place your own HTML over the chart.

## The live-price marker

The marker at the live price can be one of six built-in styles, or one you draw:

```js
chart.setOptions({ lastPrice: { marker: "ripple" } }); // "pulse" (default), "ripple", "radar", "glow", "dot", "none"
```

```html
<trade-chart live-marker="radar"></trade-chart>
```

Your own marker is a function that draws at `x, y`:

```js
chart.setOptions({
  lastPrice: {
    marker: (ctx, { x, y, color, now, animated }) => {
      const spin = animated ? now / 300 : 0;
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-6, -6, 12, 12);   // a turning square
    },
  },
});
```

The context is saved and restored around it. When `animated` is false (animation off, or the user prefers reduced motion), draw a still marker.

## Drawings: the user's tools

`<trade-chart>` has a toolbar with ten tools. Your users click one, then click on the chart once (horizontal, vertical, text) or twice (the rest).

| Tool | |
|---|---|
| `line` | A segment between two points |
| `trend` | A line through two points, continuing to the edge |
| `arrow` | An arrow from the first point to the second |
| `horizontal` | A price level across the chart, with a price tag |
| `vertical` | A time across the chart |
| `rect` | A box |
| `circle` | A circle: the centre, then a point on the edge |
| `fib` | Fibonacci retracement between a swing's two ends (levels in `drawings.fibLevels`) |
| `measure` | A box showing the change, the change in %, the number of candles and the time between two points |
| `text` | A note: click where it goes and type. Double-click to edit it later |

A selected drawing shows handles (drag them to reshape), and a bar with colours, Lock, Duplicate and Delete. The Delete key removes it; Esc deselects or cancels a tool.

Choose the tools and their order:

```html
<trade-chart drawing-tools="trend, horizontal, text"></trade-chart>  <!-- or "false" to hide the toolbar -->
```

### Drawings from code

```js
chart.setDrawingTool("trend");      // start placing, as if the user clicked the tool; null cancels
chart.addDrawing({ tool: "horizontal", points: [{ time, price: 70000 }], color: "#f5a524" });
chart.addDrawing({ tool: "text", points: [{ time, price }], text: "Support", fontSize: 16 });
chart.updateDrawing(id, { color: "#22c38e", width: 2, style: "dashed", locked: true, hidden: false, text: "New text" });
chart.duplicateDrawing(id);
chart.removeDrawing(id);
chart.clearDrawings();
```

A drawing is plain data, so you can save it:

```ts
interface Drawing {
  id: string;
  tool: DrawingTool;
  points: { time: number; price: number }[];
  color: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
  locked?: boolean;   // can't be moved or deleted by the user
  hidden?: boolean;   // kept but not drawn
  text?: string;      // text drawings
  fontSize?: number;  // text drawings
}
```

```js
chart.addEventListener("tl-drawingschange", () => localStorage.setItem("drawings", JSON.stringify(chart.drawings)));
chart.setDrawings(JSON.parse(localStorage.getItem("drawings") ?? "[]"));
```

Events: `tl-drawingschange` (all drawings, after any change), `tl-drawingcreate` (the user finished a new one), `tl-drawingselect` (the selected drawing or `null`), `tl-toolchange` (the active tool or `null`).

Make drawings display-only with `interaction: { editDrawings: false }`. Change the defaults for new drawings with the [`drawings` settings](configuration.md#drawings).
