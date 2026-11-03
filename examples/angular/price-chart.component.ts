// Angular 17+ standalone component. `npm i tickline`, then use <app-price-chart symbol="BTCUSDT" />.
import {
  AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, Input, OnDestroy, ViewChild,
} from "@angular/core";
import "tickline";
import type { Candle, TradeChartElement } from "tickline";

const REST = "https://data-api.binance.vision/api/v3/klines";
const toCandle = (r: string[]): Candle => ({ time: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });

@Component({
  selector: "app-price-chart",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // lets the template use <trade-chart>
  template: `
    <trade-chart #chart
      [attr.symbol]="symbol" [attr.timeframe]="timeframe" [attr.theme]="theme"
      indicators="sma:20, volume"
      style="display: block; height: 480px"
      (tl-requesthistory)="more($event)">
    </trade-chart>`,
})
export class PriceChartComponent implements AfterViewInit, OnDestroy {
  @Input() symbol = "BTCUSDT";
  @Input() timeframe = "1m";
  @Input() theme: "dark" | "light" = "dark";
  @ViewChild("chart") private ref!: ElementRef<TradeChartElement>;
  private ws?: WebSocket;

  private get chart() { return this.ref.nativeElement; }

  private async candles(before?: number): Promise<Candle[]> {
    const url = `${REST}?symbol=${this.symbol}&interval=${this.timeframe}&limit=500${before ? `&endTime=${before - 1}` : ""}`;
    return ((await (await fetch(url)).json()) as string[][]).map(toCandle);
  }

  async ngAfterViewInit() {
    this.chart.setData(await this.candles());
    this.ws = new WebSocket(`wss://data-stream.binance.vision/ws/${this.symbol.toLowerCase()}@aggTrade`);
    this.ws.onmessage = (e) => {
      const t = JSON.parse(e.data);
      this.chart.tick({ time: t.T, price: +t.p, volume: +t.q });
    };
  }

  async more(e: Event) {
    this.chart.prependData(await this.candles((e as CustomEvent<{ before: number }>).detail.before));
  }

  ngOnDestroy() { this.ws?.close(); }
}
