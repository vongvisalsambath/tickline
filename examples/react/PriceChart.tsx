// React 18 or 19. `npm i tickline`, then render <PriceChart symbol="BTCUSDT" />.
import { useEffect, useRef } from "react";
import "tickline";
import type { Candle, TradeChartElement } from "tickline";

// Let TSX accept the <trade-chart> tag.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "trade-chart": React.DetailedHTMLProps<React.HTMLAttributes<TradeChartElement>, TradeChartElement> & {
        symbol?: string;
        timeframe?: string;
        type?: string;
        theme?: "dark" | "light";
        indicators?: string;
      };
    }
  }
}

const REST = "https://data-api.binance.vision/api/v3/klines";
const toCandle = (r: string[]): Candle => ({ time: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });
const candles = (symbol: string, tf: string, before?: number) =>
  fetch(`${REST}?symbol=${symbol}&interval=${tf}&limit=500${before ? `&endTime=${before - 1}` : ""}`)
    .then((r) => r.json())
    .then((rows: string[][]) => rows.map(toCandle));

export function PriceChart({ symbol = "BTCUSDT", timeframe = "1m", theme = "dark" as "dark" | "light" }) {
  const ref = useRef<TradeChartElement>(null);

  useEffect(() => {
    const chart = ref.current!;
    let ws: WebSocket | undefined, cancelled = false;

    candles(symbol, timeframe).then((data) => {
      if (cancelled) return;
      chart.setData(data);
      ws = new WebSocket(`wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@aggTrade`);
      ws.onmessage = (e) => {
        const t = JSON.parse(e.data);
        chart.tick({ time: t.T, price: +t.p, volume: +t.q });
      };
    });

    const more = async (e: Event) => chart.prependData(await candles(symbol, timeframe, (e as CustomEvent).detail.before));
    chart.addEventListener("tl-requesthistory", more);

    return () => {
      cancelled = true;
      ws?.close();
      chart.removeEventListener("tl-requesthistory", more);
    };
  }, [symbol, timeframe]);

  return (
    <trade-chart
      ref={ref}
      symbol={symbol}
      timeframe={timeframe}
      theme={theme}
      indicators="sma:20, volume"
      style={{ display: "block", height: 480 }}
    />
  );
}
