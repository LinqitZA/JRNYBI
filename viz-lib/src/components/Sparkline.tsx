/**
 * Sparkline wrapper component
 *
 * Thin wrapper around `react-sparklines` (MIT, ~10kB) that exposes a single
 * <Sparkline /> API with consistent JRNYBI styling for use in:
 *   - KPI Card v2 (trend mini-chart under the headline number)
 *   - Table viz in-cell sparklines (one per row)
 *
 * Variants:
 *   - "line" (default): a line chart, optional reference line + spots
 *   - "bar":            vertical bars (good for sparse-but-positive series)
 *   - "spots":          line chart with min/max/last spots highlighted
 *
 * Colors default to the WCAG-AA accessible JRNY palette CSS custom
 * properties (defined in client/app/assets/less/jrny-theme.less). When this
 * component is rendered outside the main app (e.g. embed iframe), the
 * caller can pass an explicit `color` prop to override.
 *
 * Compatible with React 16.14.
 */
import React from "react";
import {
  Sparklines,
  SparklinesLine,
  SparklinesBars,
  SparklinesSpots,
  SparklinesReferenceLine,
} from "react-sparklines";

export type SparklineVariant = "line" | "bar" | "spots";

export type SparklineColorToken =
  | "primary"
  | "positive"
  | "negative"
  | "warning"
  | "neutral"
  | "info";

// Map a semantic JRNY color token to a CSS var() string. Caller can also
// pass a raw color (e.g. "#2563eb" or "rgba(0,0,0,0.5)") and we use that
// directly.
const COLOR_TOKENS: Record<SparklineColorToken, string> = {
  primary: "var(--jrny-primary, #2563eb)",
  positive: "var(--jrny-positive, #117a3b)",
  negative: "var(--jrny-negative, #b42318)",
  warning: "var(--jrny-warning, #b54708)",
  neutral: "var(--jrny-neutral, #475569)",
  info: "var(--jrny-info, #1d4ed8)",
};

function resolveColor(color: string | SparklineColorToken | undefined, fallback: SparklineColorToken): string {
  if (!color) {
    return COLOR_TOKENS[fallback];
  }
  if (color in COLOR_TOKENS) {
    return COLOR_TOKENS[color as SparklineColorToken];
  }
  return color;
}

export interface SparklineProps {
  /** Numeric data points to plot. Must contain at least one finite number. */
  data: ReadonlyArray<number>;
  /** Chart variant — defaults to "line". */
  variant?: SparklineVariant;
  /**
   * Stroke / bar color. Either a semantic token ("primary", "positive", ...)
   * or any CSS color string. Defaults to "primary" (JRNY blue).
   */
  color?: string | SparklineColorToken;
  /** Optional fill color under the line. Defaults to "none". */
  fillColor?: string | SparklineColorToken;
  /** Line stroke width — only applies to "line"/"spots" variants. */
  strokeWidth?: number;
  /** Total width in pixels. Defaults to 100. */
  width?: number;
  /** Total height in pixels. Defaults to 30. */
  height?: number;
  /** Show min/max/last spots — only for "line" variant. Forced on for "spots". */
  showSpots?: boolean;
  /** Show a reference line: "mean" | "median" | "max" | "min" | number. */
  referenceLine?: "mean" | "median" | "max" | "min" | "avg" | number;
  /** Margin around the chart in px. Defaults to 2. */
  margin?: number;
  /** ARIA label for screen readers. Highly recommended for in-cell sparklines. */
  ariaLabel?: string;
  /** Optional CSS class for the wrapping <svg>. */
  className?: string;
  /** Optional inline style passed to the wrapping <svg>. */
  style?: React.CSSProperties;
}

/**
 * Render a tiny sparkline chart with JRNYBI defaults.
 *
 * Empty / invalid data → returns null (so a table cell stays empty rather
 * than rendering a broken SVG).
 */
const Sparkline: React.FC<SparklineProps> = ({
  data,
  variant = "line",
  color,
  fillColor,
  strokeWidth = 1.5,
  width = 100,
  height = 30,
  showSpots = false,
  referenceLine,
  margin = 2,
  ariaLabel,
  className,
  style,
}) => {
  const cleanData = (data || []).filter((n) => typeof n === "number" && isFinite(n));
  if (cleanData.length === 0) {
    return null;
  }

  const stroke = resolveColor(color, "primary");
  const fill = fillColor ? resolveColor(fillColor, "primary") : "none";

  const refLineColor = "var(--jrny-text-3, #64748b)";
  const refLineType = referenceLine === "avg" ? "mean" : referenceLine;

  const wrapperProps: any = {
    data: cleanData as number[],
    width,
    height,
    margin,
    svgWidth: width,
    svgHeight: height,
  };

  // <svg> accessibility props are forwarded by Sparklines onto the root <svg>.
  const a11yProps: any = ariaLabel
    ? { "aria-label": ariaLabel, role: "img" }
    : { "aria-hidden": "true", role: "presentation" };

  const renderInner = () => {
    if (variant === "bar") {
      return <SparklinesBars style={{ fill: stroke, fillOpacity: 0.85 }} />;
    }
    // line / spots
    return (
      <>
        <SparklinesLine
          color={stroke}
          style={{ fill, strokeWidth }}
        />
        {(variant === "spots" || showSpots) && (
          <SparklinesSpots
            size={2}
            style={{ fill: stroke, stroke: stroke, strokeWidth: 1 }}
          />
        )}
        {refLineType !== undefined && (
          <SparklinesReferenceLine
            type={typeof refLineType === "number" ? "custom" : (refLineType as any)}
            value={typeof refLineType === "number" ? refLineType : undefined}
            style={{ stroke: refLineColor, strokeOpacity: 0.5, strokeDasharray: "2, 2" }}
          />
        )}
      </>
    );
  };

  return (
    <span className={className} style={style} {...a11yProps}>
      <Sparklines {...wrapperProps}>{renderInner()}</Sparklines>
    </span>
  );
};

export default Sparkline;
