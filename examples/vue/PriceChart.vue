<!--
  Vue 3. `npm i tickline`, and tell Vue that <trade-chart> is a custom element (vite.config.ts):
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "trade-chart" } } })
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import "tickline";
import type { Candle, TradeChartElement } from "tickline";

const props = withDefaults(defineProps<{ symbol?: string; timeframe?: string; theme?: "dark" | "light" }>(), {
  symbol: "BTCUSDT",
  timeframe: "1m",
  theme: "dark",
});

const chart = ref<TradeChartElement>();
let ws: WebSocket | undefined;

const REST = "https://data-api.binance.vision/api/v3/klines";
const toCandle = (r: string[]): Candle => ({ time: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });
async function candles(before?: number) {
  const url = `${REST}?symbol=${props.symbol}&interval=${props.timeframe}&limit=500${before ? `&endTime=${before - 1}` : ""}`;
  return ((await (await fetch(url)).json()) as string[][]).map(toCandle);
}

async function load() {
  ws?.close();
  chart.value!.setData(await candles());
  ws = new WebSocket(`wss://data-stream.binance.vision/ws/${props.symbol.toLowerCase()}@aggTrade`);
  ws.onmessage = (e) => {
    const t = JSON.parse(e.data);
    chart.value?.tick({ time: t.T, price: +t.p, volume: +t.q });
  };
}

async function more(e: CustomEvent<{ before: number }>) {
  chart.value!.prependData(await candles(e.detail.before));
}

onMounted(load);
watch(() => [props.symbol, props.timeframe], load);
onBeforeUnmount(() => ws?.close());
</script>

<template>
  <trade-chart
    ref="chart"
    :symbol="symbol"
    :timeframe="timeframe"
    :theme="theme"
    indicators="sma:20, volume"
    style="display: block; height: 480px"
    @tl-requesthistory="more"
  />
</template>
