# Accessibility

A price chart is visual by nature, so a good accessible experience pairs it with text your app already has (the price, the change, a table of positions). Here's what the chart itself does, and what you can add.

## Keyboard

Click or tab to the chart, then:

| Key | |
|---|---|
| ← → | Scroll back and forward in time |
| + − | Zoom in and out |
| End | Back to the live price |
| Home | Show the whole history |
| F | Full screen |
| Esc | Cancel a drawing tool, deselect a drawing, or leave full screen (where the page is covered) |
| Delete, Backspace | Delete the selected drawing |

All the built-in buttons are real buttons with names, so they work with Tab, Enter and Space, and screen readers announce them. Turn the chart's shortcuts off with `interaction: { keyboard: false }` if they clash with your app's.

## Screen readers

The canvas has the role `img` and the name "Price chart" (change it with `labels.chart`, e.g. "Bitcoin price, 1 minute candles"). Messages such as the zoom limit are announced.

Give screen-reader users the numbers as text next to the chart, for example:

```html
<p class="sr-only" aria-live="polite" id="price-text"></p>
<script>
  let last = 0;
  setInterval(() => {
    const c = chart.data.at(-1);
    if (c && c.close !== last) document.getElementById("price-text").textContent = `BTC ${c.close}`;
    last = c?.close ?? 0;
  }, 10_000); // not on every tick: that would be too chatty
</script>
```

## Motion

When the user's system asks for reduced motion, the chart doesn't glide or pulse: prices and the scale move straight to their new values, and the live marker is still. You can also turn animation off for everyone with `animation: { enabled: false }`.

## Colour

Up and down aren't shown by colour alone: candles also differ by direction (open above or below close), markers have ▲ and ▼, and the measure tool shows a sign. If your users need other colours (for example blue and orange for red-green colour blindness), set `--tl-up` and `--tl-down`, or let them choose.

## Touch

Buttons are at least 28 px with generous hit areas, pinch and drag work on phones, and tapping the chart shows the buttons on touch screens.
