// Feature #203: Population pyramid (mirrored bar chart) preset
//
// Symmetric back-to-back bar chart, classic shape for:
//   - Demographic splits (age x gender)
//   - Positive/negative variance vs target
//   - Gain/loss comparison (winners vs losers)
//
// Naturally pairs with a horizontal bar (`swappedAxes: true`) — that's the
// canonical demographic layout — but works either orientation. We don't force
// swappedAxes; the user picks the orientation in General settings.
//
// Implementation: when enabled, find the configured left/right series in the
// prepared list and negate the left series' y values for layout purposes.
// Labels and hover stay positive via a `text`/`hovertemplate` override that
// reads the original values back out of sourceData.

import { isFinite, isNil } from "lodash";

type Cfg = {
  enabled?: boolean;
  leftSeries?: string | null;
  rightSeries?: string | null;
  leftColor?: string;
  rightColor?: string;
};

function abs(v: any): number {
  if (isNil(v)) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return isFinite(n) ? Math.abs(n) : 0;
}

/**
 * Find a series in the prepared list by name. Pyramid mirroring only works on
 * two specific series — by default the first and second. Users override via
 * options.pyramid.{leftSeries,rightSeries} in the editor.
 */
function findSeriesByName(list: any[], name: string | null | undefined): any | null {
  if (!name) return null;
  for (const s of list) {
    if (s && s.name === name && s.type === "bar") return s;
  }
  return null;
}

/**
 * Pick the default left/right series when the user hasn't named them:
 * first two bar-type series in the prepared list. Skips overlays.
 */
function pickDefaults(list: any[]): { left: any | null; right: any | null } {
  const bars: any[] = [];
  for (const s of list) {
    if (!s || s.type !== "bar" || s.visible === false) continue;
    if (typeof s.name === "string" && /forecast|anomaly|cumulative/i.test(s.name)) continue;
    bars.push(s);
  }
  return { left: bars[0] || null, right: bars[1] || null };
}

/**
 * Negate every y value and replace error_y array signs to match. Stashes the
 * original absolute values on a parallel array so the hover template (set
 * below) can show "100" instead of "-100" for the left side.
 */
function negateSeries(s: any, color: string | undefined): void {
  if (!Array.isArray(s.y)) return;
  const absY: number[] = s.y.map((v: any) => abs(v));
  s.__pyramidAbsY = absY;
  s.y = s.y.map((v: any) => -abs(v));
  if (s.error_y && Array.isArray(s.error_y.array)) {
    s.error_y.array = s.error_y.array.map((v: any) => abs(v));
  }
  // Render absolute values as inside-bar text labels so the user sees real
  // magnitudes regardless of the negation hack
  s.text = absY.map((v: number) => String(v));
  s.hovertemplate = "%{x}<br>%{text}<extra>" + (s.name || "") + "</extra>";
  if (color) {
    s.marker = { ...(s.marker || {}), color };
  }
}

/**
 * Tag the right-side series with hover + colour so left and right read as a
 * consistent pair.
 */
function decorateRight(s: any, color: string | undefined): void {
  if (!Array.isArray(s.y)) return;
  const absY: number[] = s.y.map((v: any) => abs(v));
  s.__pyramidAbsY = absY;
  s.text = absY.map((v: number) => String(v));
  s.hovertemplate = "%{x}<br>%{text}<extra>" + (s.name || "") + "</extra>";
  if (color) {
    s.marker = { ...(s.marker || {}), color };
  }
}

/**
 * Apply pyramid transform to the prepared series list. Mutates the matched
 * left series in-place (negate y, swap colour, add text labels) and decorates
 * the right side with a matching colour + label. Stashes side-channel markers
 * on options for prepareLayout to set barmode='overlay' and to render axis
 * ticks as absolute values.
 */
export function applyPyramid(plotlySeriesList: any[], options: any): any[] {
  if (!options || !options.pyramid || !options.pyramid.enabled) return plotlySeriesList;
  if (options.globalSeriesType !== "column") return plotlySeriesList;

  const cfg: Cfg = options.pyramid || {};
  const defaults = pickDefaults(plotlySeriesList);
  const leftName = cfg.leftSeries || (defaults.left ? defaults.left.name : null);
  const rightName = cfg.rightSeries || (defaults.right ? defaults.right.name : null);

  const leftSeries = findSeriesByName(plotlySeriesList, leftName) || defaults.left;
  const rightSeries = findSeriesByName(plotlySeriesList, rightName) || defaults.right;

  if (!leftSeries || !rightSeries || leftSeries === rightSeries) {
    // Not enough series for a pyramid — bail without mutation
    return plotlySeriesList;
  }

  negateSeries(leftSeries, cfg.leftColor);
  decorateRight(rightSeries, cfg.rightColor);

  // Side channel for prepareLayout: switch to overlay barmode + format ticks
  // as absolute so the negative side reads positive on the axis.
  options.__pyramidActive = true;

  return plotlySeriesList;
}
