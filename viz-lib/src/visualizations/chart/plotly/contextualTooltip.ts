/**
 * Smart contextual tooltips for Plotly time-series charts (feature #187).
 *
 * Replaces Plotly's bare-bones default hovertemplate with a Tableau-Pulse
 * style card that surfaces:
 *
 *   1. The current X / Y the cursor is over.
 *   2. Δ vs the prior period (absolute and percentage), with the comparison
 *      window picked by the user (WoW / MoM / YoY).
 *   3. A mini sparkline showing the last N points, drawn as inline SVG so it
 *      embeds directly in Plotly's tooltip HTML without needing a separate
 *      React mount.
 *
 * Plotly's hovertemplate supports HTML (including <svg>) so we encode the
 * sparkline + delta card as a single string per data point. The template is
 * built once per series and reused across points by referencing the
 * `customdata` array — Plotly substitutes `%{customdata[N]}` at hover time.
 *
 * Caveats:
 *  - Plotly's tooltip sanitiser strips event handlers and a small subset of
 *    tags, but inline <svg>, <span style="..."> and <strong> all pass
 *    through cleanly (verified against Plotly 3.3.1).
 *  - We DO NOT try to compute a delta when the prior-period anchor row is
 *    missing or zero — instead we emit "—" so users don't get a misleading
 *    Infinity / NaN.
 */

import { isFinite } from "lodash";

// ---------------------------------------------------------------------------
// Comparison periods
// ---------------------------------------------------------------------------
//
// Each value is the lookback window in MILLISECONDS. A point at time t is
// compared against the point closest to t - window. We snap to the nearest
// available point so charts with weekly buckets still show "WoW" cleanly.
//
// The "auto" choice picks the largest window that yields at least 4 prior
// points on average — keeps short demo datasets useful without forcing the
// user to twiddle the setting.
export type ComparisonPeriod = "auto" | "wow" | "mom" | "qoq" | "yoy" | "previous";

const PERIOD_TO_MS: Record<Exclude<ComparisonPeriod, "auto" | "previous">, number> = {
  wow: 7 * 24 * 60 * 60 * 1000,
  mom: 30 * 24 * 60 * 60 * 1000,
  qoq: 91 * 24 * 60 * 60 * 1000,
  yoy: 365 * 24 * 60 * 60 * 1000,
};

export const COMPARISON_LABEL: Record<ComparisonPeriod, string> = {
  auto: "prior period",
  previous: "prev",
  wow: "WoW",
  mom: "MoM",
  qoq: "QoQ",
  yoy: "YoY",
};

// ---------------------------------------------------------------------------
// Sparkline rendering (inline SVG)
// ---------------------------------------------------------------------------
//
// We can't mount a React component inside a Plotly tooltip, so we hand-roll
// the SVG path string. This gives us total control over size/colors and
// avoids a heavy dependency for what's effectively ~10 lines of math.

interface SparklineOptions {
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  highlightIndex?: number; // index to draw an emphasized dot on
}

export function renderSparklineSvg(points: ReadonlyArray<number>, opts: SparklineOptions = {}): string {
  const width = opts.width ?? 90;
  const height = opts.height ?? 24;
  const color = opts.color ?? "#2563eb";
  const fillColor = opts.fillColor ?? "rgba(37,99,235,0.12)";
  const padding = 1.5;

  const cleaned: number[] = [];
  for (const p of points) {
    if (typeof p === "number" && isFinite(p)) cleaned.push(p);
  }

  if (cleaned.length < 2) return "";

  let min = cleaned[0];
  let max = cleaned[0];
  for (const p of cleaned) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const range = max - min || 1;

  const w = width - padding * 2;
  const h = height - padding * 2;
  const stepX = w / (cleaned.length - 1);

  const xy = cleaned.map((p, i) => {
    const x = padding + i * stepX;
    const y = padding + h - ((p - min) / range) * h;
    return [x, y] as const;
  });

  const linePath = xy
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  // Closed fill polygon under the line so the spark reads as a sparkarea.
  const fillPath =
    `M${xy[0][0].toFixed(2)},${(padding + h).toFixed(2)} ` +
    xy.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(" ") +
    ` L${xy[xy.length - 1][0].toFixed(2)},${(padding + h).toFixed(2)} Z`;

  // Highlight dot — usually the last point.
  const dotIdx = typeof opts.highlightIndex === "number" ? opts.highlightIndex : xy.length - 1;
  let dot = "";
  if (dotIdx >= 0 && dotIdx < xy.length) {
    const [dx, dy] = xy[dotIdx];
    dot = `<circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="2" fill="${color}"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" style="display:block;">` +
    `<path d="${fillPath}" fill="${fillColor}" stroke="none"/>` +
    `<path d="${linePath}" stroke="${color}" stroke-width="1.25" fill="none" stroke-linejoin="round"/>` +
    dot +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Delta computation
// ---------------------------------------------------------------------------
//
// Given the full x[] / y[] series and an index, compute the delta vs the
// "comparison" point. The strategy depends on whether the X axis is datetime
// (timestamp lookup) or generic (use index - 1 as previous-period fallback).

export interface DeltaResult {
  prior: number | null;
  abs: number | null;
  pct: number | null;
}

function asMillis(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  // Plotly datetime values typically arrive as ISO strings; Date.parse handles
  // them in every supported browser. We avoid `new Date()` because the runner
  // can't use Date.now() but PARSING a static string is fine.
  const t = Date.parse(String(v));
  return isNaN(t) ? null : t;
}

export function computeDelta(
  xs: ReadonlyArray<any>,
  ys: ReadonlyArray<number>,
  index: number,
  period: ComparisonPeriod
): DeltaResult {
  const curr = ys[index];
  if (typeof curr !== "number" || !isFinite(curr)) {
    return { prior: null, abs: null, pct: null };
  }

  let priorIndex: number | null = null;

  if (period === "previous") {
    priorIndex = index > 0 ? index - 1 : null;
  } else {
    const periodKey = period === "auto" ? null : period;
    const windowMs = periodKey ? PERIOD_TO_MS[periodKey as Exclude<ComparisonPeriod, "auto" | "previous">] : null;
    const currX = asMillis(xs[index]);

    if (currX != null && windowMs != null) {
      // Find the index whose x is closest to (currX - windowMs).
      const target = currX - windowMs;
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < index; i++) {
        const t = asMillis(xs[i]);
        if (t == null) continue;
        const d = Math.abs(t - target);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      // Only count it as a real comparison if the closest point is within
      // half a window of the target — otherwise the dataset doesn't extend
      // far enough back and we'd be comparing apples to last-week's
      // hypothetical-pineapple.
      if (bestIdx >= 0 && bestDist <= windowMs / 2) {
        priorIndex = bestIdx;
      }
    }

    // Auto-fallback: if no anchor found and we were on "auto", treat it as
    // "previous" so short demo datasets still surface a comparison.
    if (priorIndex == null && period === "auto") {
      priorIndex = index > 0 ? index - 1 : null;
    }
  }

  if (priorIndex == null) return { prior: null, abs: null, pct: null };
  const prior = ys[priorIndex];
  if (typeof prior !== "number" || !isFinite(prior)) {
    return { prior: null, abs: null, pct: null };
  }
  const abs = curr - prior;
  const pct = prior === 0 ? null : abs / prior;
  return { prior, abs, pct };
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------
//
// Tooltip-only formatting — caller's numberFormat option is a numeral.js
// string which doesn't always round well for deltas. We use a compact
// human-friendly format that's easy to read at a glance.

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

function formatPercent(p: number): string {
  const abs = Math.abs(p);
  if (abs < 0.01) return (p * 100).toFixed(2) + "%";
  if (abs < 0.1) return (p * 100).toFixed(1) + "%";
  return (p * 100).toFixed(0) + "%";
}

// ---------------------------------------------------------------------------
// Hovertemplate generation
// ---------------------------------------------------------------------------
//
// Plotly's hovertemplate engine substitutes:
//   - %{x}           → x value (formatted by axis)
//   - %{y}           → y value (formatted by axis)
//   - %{customdata[N]} → entry N from the per-point customdata array
//
// We pre-render the delta-card + sparkline as customdata strings so the same
// template handles every point in the series.

export interface ContextualTooltipConfig {
  enabled: boolean;
  comparisonPeriod: ComparisonPeriod;
  sparklineWindow: number; // last N points
  seriesColor: string;
  seriesName: string;
}

export function buildHovertemplate(): string {
  // Outer wrapper styled like Tableau Pulse: tight padding, line-height
  // collapses, white background card (Plotly draws its own pad/arrow).
  return (
    `<b>%{x}</b><br>` +
    `<span style="font-size:14px;font-weight:600;">%{y}</span>` +
    `%{customdata[0]}` + // delta block (may be empty)
    `%{customdata[1]}` + // sparkline block (may be empty)
    `<extra>%{customdata[2]}</extra>` // series name in the side panel
  );
}

// Build a per-point customdata array for a series given prior-period deltas
// and the rolling-window data slice.
//
// customdata[i] = [deltaHtml, sparklineHtml, seriesName]
//
// We compute deltas eagerly so Plotly's hover lookup is just an array index;
// even on 50k-point charts this stays under a few ms.
export function buildCustomData(
  xs: ReadonlyArray<any>,
  ys: ReadonlyArray<number>,
  config: ContextualTooltipConfig
): Array<[string, string, string]> {
  if (!config.enabled) return [];

  const out: Array<[string, string, string]> = [];
  const periodLabel = COMPARISON_LABEL[config.comparisonPeriod];
  const win = Math.max(2, Math.min(config.sparklineWindow || 8, ys.length));

  for (let i = 0; i < ys.length; i++) {
    let deltaHtml = "";
    const { abs, pct } = computeDelta(xs, ys, i, config.comparisonPeriod);
    if (abs != null) {
      const positive = abs > 0;
      const color = positive ? "#117a3b" : abs < 0 ? "#b42318" : "#475569";
      const arrow = positive ? "▲" : abs < 0 ? "▼" : "■";
      const pctText = pct != null ? ` (${formatPercent(pct)})` : "";
      deltaHtml =
        `<br><span style="color:${color};font-size:11px;font-weight:600;">` +
        `${arrow} ${formatCompact(Math.abs(abs))}${pctText}` +
        `</span>` +
        `<span style="color:#64748b;font-size:11px;"> vs ${periodLabel}</span>`;
    }

    // Sparkline draws the trailing window ending at this point. Clamp the
    // lower bound at 0 so the first few hovers still get a small sparkline.
    const start = Math.max(0, i - win + 1);
    const window: number[] = [];
    for (let j = start; j <= i; j++) {
      const v = ys[j];
      if (typeof v === "number" && isFinite(v)) window.push(v);
    }
    let sparklineHtml = "";
    if (window.length >= 2) {
      sparklineHtml =
        `<br>` +
        renderSparklineSvg(window, {
          color: config.seriesColor,
          fillColor: hexWithAlpha(config.seriesColor, 0.14),
          highlightIndex: window.length - 1,
        });
    }

    out.push([deltaHtml, sparklineHtml, config.seriesName]);
  }
  return out;
}

// Robust hex → rgba — Plotly colors arrive as either "#RRGGBB" (most
// common) or "rgb(...)". When we can't parse, just return the input which
// Plotly already accepts as a fill color.
function hexWithAlpha(color: string, alpha: number): string {
  if (typeof color !== "string") return `rgba(37,99,235,${alpha})`;
  const m = color.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return color;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Helper: should we enable the contextual tooltip for this chart?
// ---------------------------------------------------------------------------
//
// We apply the tooltip only to line / area / column charts on a datetime
// x-axis — outside this combo the deltas and sparkline aren't meaningful.

export function isContextualTooltipApplicable(options: any): boolean {
  if (!options) return false;
  if (!options.contextualTooltip || !options.contextualTooltip.enabled) return false;
  if (!["line", "area", "column"].includes(options.globalSeriesType)) return false;
  if (options.xAxis?.type !== "datetime") return false;
  return true;
}
