// Tickline: a live trading chart for any website.
export { Chart } from "./chart";
export type { ChartEvents, ChartState, IndicatorInfo, IndicatorStyle } from "./chart";
export { syncCharts } from "./sync";
export type { SyncOptions, SyncTarget } from "./sync";
export { defaultOptions, DEFAULT_LABELS } from "./options";
export type {
  ChartOptions, ResolvedOptions, ThemeInput, LineStyle, TimeLabelKind, LayoutOptions, SeriesOptions, GridOptions, PriceScaleOptions,
  TimeScaleOptions, CrosshairOptions, LegendOptions, LastPriceOptions, InteractionOptions, AnimationOptions, HistoryOptions,
  DrawingOptions, FormatOptions, Labels, UiOptions, LivePositionOptions, WatermarkOptions, AnimationDurations, Easing,
} from "./options";
export { registerIndicator, listIndicators, getIndicator, sma, ema, rsi, stdev } from "./indicators";
export type { IndicatorDefinition, IndicatorOutput, IndicatorLine } from "./indicators";
export { TradeChartElement, defineTradeChart } from "./element";
export { DARK, LIGHT, CSS_VARS } from "./theme";
export { parseTimeframe, parseSpan, bucketStart } from "./time";
export { heikinAshi } from "./data";
export { FIB_LEVELS, TOOL_NAMES } from "./drawings";
export type { Drawing, DrawingTool, DrawingPoint } from "./drawings";
export type * from "./types";

import { defineTradeChart } from "./element";
defineTradeChart();
