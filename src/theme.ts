// Colours and fonts. Every value can be overridden with a CSS custom property on <trade-chart>.
import type { Theme } from "./types";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", "Cascadia Code", Menlo, Consolas, monospace';

export const DARK: Theme = {
  background: "#0b0f17",
  grid: "rgba(148, 163, 184, 0.07)",
  text: "#7d8799",
  textStrong: "#e6e9ef",
  axisLine: "rgba(148, 163, 184, 0.14)",
  up: "#22c38e",
  down: "#f0506e",
  line: "#4c9aff",
  areaTop: "rgba(76, 154, 255, 0.32)",
  areaBottom: "rgba(76, 154, 255, 0)",
  accent: "#4c9aff",
  accentText: "#ffffff",
  crosshair: "rgba(230, 233, 239, 0.45)",
  pillBackground: "#e6e9ef",
  pillText: "#0b0f17",
  overlayText: "#ffffff",
  levelLine: "rgba(148, 163, 184, 0.25)",
  font: FONT,
  monoFont: MONO,
};

export const LIGHT: Theme = {
  background: "#ffffff",
  grid: "rgba(15, 23, 42, 0.06)",
  text: "#6b7280",
  textStrong: "#0f172a",
  axisLine: "rgba(15, 23, 42, 0.12)",
  up: "#0f9d6e",
  down: "#e0344f",
  line: "#2563eb",
  areaTop: "rgba(37, 99, 235, 0.22)",
  areaBottom: "rgba(37, 99, 235, 0)",
  accent: "#2563eb",
  accentText: "#ffffff",
  crosshair: "rgba(15, 23, 42, 0.4)",
  pillBackground: "#0f172a",
  pillText: "#ffffff",
  overlayText: "#ffffff",
  levelLine: "rgba(15, 23, 42, 0.22)",
  font: FONT,
  monoFont: MONO,
};

/** CSS custom property for each theme key: --tl-background, --tl-up, --tl-area-top ... */
export const CSS_VARS: Record<keyof Theme, string> = Object.fromEntries(
  (Object.keys(DARK) as (keyof Theme)[]).map((k) => [k, "--tl-" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())]),
) as Record<keyof Theme, string>;

/** The preset, with any CSS custom properties set on the element applied on top. */
export function resolveTheme(base: Theme, style: CSSStyleDeclaration | null): Theme {
  const t: Theme = { ...base };
  if (!style) return t;
  for (const key of Object.keys(CSS_VARS) as (keyof Theme)[]) {
    const v = style.getPropertyValue(CSS_VARS[key]).trim();
    if (v) t[key] = v;
  }
  return t;
}
