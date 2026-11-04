# Frameworks

`<trade-chart>` is a standard custom element, so it works in every framework. The pattern is always the same:

1. Import `tickline` once (it registers the element).
2. Render `<trade-chart>` with a height.
3. Get the element (a ref), then call `setData`, `tick` and the rest on it.
4. Listen to `tl-…` events; close your sockets when the component goes away.

Complete components, each with a live price feed, are in [`examples/`](https://github.com/vongvisalsambath/tickline/tree/main/examples). The [MCP server](ai.md) can also write one for your project.

## React (18 and 19)

```tsx
import { useEffect, useRef } from "react";
import "tickline";
import type { TradeChartElement } from "tickline";

export function PriceChart({ symbol }: { symbol: string }) {
  const ref = useRef<TradeChartElement>(null);

  useEffect(() => {
    const chart = ref.current!;
    let ws: WebSocket | undefined;
    let cancelled = false;
    loadCandles(symbol).then((candles) => {
      if (cancelled) return;
      chart.setData(candles);
      ws = new WebSocket(priceUrl(symbol));
      ws.onmessage = (e) => chart.tick(JSON.parse(e.data));
    });
    const more = async (e: Event) => chart.prependData(await loadCandles(symbol, (e as CustomEvent).detail.before));
    chart.addEventListener("tl-requesthistory", more);
    return () => { cancelled = true; ws?.close(); chart.removeEventListener("tl-requesthistory", more); };
  }, [symbol]);

  return <trade-chart ref={ref} symbol={symbol} timeframe="1m" style={{ display: "block", height: 480 }} />;
}
```

For TypeScript to accept the tag, add a declaration once (see [`examples/react/PriceChart.tsx`](https://github.com/vongvisalsambath/tickline/blob/main/examples/react/PriceChart.tsx)):

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "trade-chart": React.DetailedHTMLProps<React.HTMLAttributes<TradeChartElement>, TradeChartElement> & Record<string, unknown>;
    }
  }
}
```

Listen to `tl-` events with `addEventListener` in an effect, as above; it works the same in React 18 and 19.

### Next.js

Importing `tickline` is safe on the server (it only registers the element in the browser), but the chart itself draws in the browser. Put it in a client component, and skip server rendering for it:

```tsx
"use client";
import dynamic from "next/dynamic";
const PriceChart = dynamic(() => import("./PriceChart").then((m) => m.PriceChart), { ssr: false });
```

## Vue 3

Tell Vue that `trade-chart` is a custom element (`vite.config.ts`):

```ts
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "trade-chart" } } })
```

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import "tickline";
import type { TradeChartElement } from "tickline";

const chart = ref<TradeChartElement>();
let ws: WebSocket | undefined;

onMounted(async () => {
  chart.value!.setData(await loadCandles());
  ws = new WebSocket(priceUrl());
  ws.onmessage = (e) => chart.value?.tick(JSON.parse(e.data));
});
onBeforeUnmount(() => ws?.close());
const more = async (e: CustomEvent<{ before: number }>) => chart.value!.prependData(await loadCandles(e.detail.before));
</script>

<template>
  <trade-chart ref="chart" symbol="BTC/USDT" timeframe="1m" style="display: block; height: 480px" @tl-requesthistory="more" />
</template>
```

### Nuxt

Wrap it in `<ClientOnly>` and set `vue.compilerOptions.isCustomElement` in `nuxt.config.ts`. Importing `tickline` on the server is safe.

## Angular

```ts
import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, OnDestroy, ViewChild } from "@angular/core";
import "tickline";
import type { TradeChartElement } from "tickline";

@Component({
  selector: "app-price-chart",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<trade-chart #chart symbol="BTC/USDT" timeframe="1m" style="display: block; height: 480px"
               (tl-requesthistory)="more($event)"></trade-chart>`,
})
export class PriceChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild("chart") private ref!: ElementRef<TradeChartElement>;
  private ws?: WebSocket;

  async ngAfterViewInit() {
    const chart = this.ref.nativeElement;
    chart.setData(await loadCandles());
    this.ws = new WebSocket(priceUrl());
    this.ws.onmessage = (e) => chart.tick(JSON.parse(e.data));
  }
  async more(e: Event) { this.ref.nativeElement.prependData(await loadCandles((e as CustomEvent).detail.before)); }
  ngOnDestroy() { this.ws?.close(); }
}
```

Bind attributes with `[attr.timeframe]="tf"`. For Angular Universal (SSR), only touch the element in the browser (`isPlatformBrowser`).

## Svelte

```svelte
<script>
  import { onMount } from "svelte";
  import "tickline";
  let chart;
  onMount(() => {
    let ws;
    loadCandles().then((c) => { chart.setData(c); ws = new WebSocket(priceUrl()); ws.onmessage = (e) => chart.tick(JSON.parse(e.data)); });
    return () => ws?.close();
  });
</script>

<trade-chart bind:this={chart} symbol="BTC/USDT" timeframe="1m" style="display: block; height: 480px"></trade-chart>
```

In SvelteKit, importing `tickline` on the server is safe; the chart starts in the browser when the element is added to the page.

## Blazor (.NET 8+)

Load the script and a small bridge, then call it from C#. Full component: [`examples/blazor`](https://github.com/vongvisalsambath/tickline/tree/main/examples/blazor).

```html
<!-- App.razor or index.html, before blazor.web.js -->
<script src="https://unpkg.com/tickline@0.1.0/dist/tickline.umd.js"></script>
<script src="tickline-interop.js"></script>
```

```razor
@inject IJSRuntime JS
<trade-chart id="chart" symbol="EUR/USD" timeframe="1m" style="display: block; height: 480px"></trade-chart>

@code {
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;
        await JS.InvokeVoidAsync("tickline.setData", "chart", await Prices.GetCandlesAsync());
        Prices.OnTick += t => JS.InvokeVoidAsync("tickline.tick", "chart", t);  // e.g. from SignalR
    }
}
```

C# records serialise to camelCase (`time`, `open` …), which is what the chart reads. Times must be Unix milliseconds: `DateTimeOffset.ToUnixTimeMilliseconds()`.

Settings from Razor without JavaScript: put them in the `options` attribute as JSON.

```razor
<trade-chart options="@JsonSerializer.Serialize(new { livePosition = new { x = 0.5, y = 0.5 } })"></trade-chart>
```

## Without the element

`Chart` draws into any container and has no built-in buttons, which suits apps with their own controls:

```js
import { Chart } from "tickline";
const chart = new Chart(document.getElementById("box"), { symbol: "EUR/USD", timeframe: "5m" });
chart.on("requesthistory", async ({ before }) => chart.prependData(await loadCandles(before)));
// later: chart.destroy();
```

The container needs a size. Events are `chart.on(name, handler)` (without the `tl-` prefix), which returns a function that removes the handler.
