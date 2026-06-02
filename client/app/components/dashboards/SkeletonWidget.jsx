import React from "react";
import PropTypes from "prop-types";
import Skeleton from "antd/lib/skeleton";

import "./SkeletonWidget.less";

/**
 * SkeletonWidget — placeholder UI shown while a dashboard widget's data is
 * loading. Replaces the spinning-circle loader with an Ant Design Skeleton
 * shaped roughly like the final visualization (chart bars, counter block,
 * or table rows). This previews layout before data arrives and avoids the
 * twitchy spinner feel on slow queries.
 *
 * The component sizes itself to fill the parent container (the widget's
 * grid cell), so the dashboard layout doesn't shift when real content
 * replaces the skeleton.
 *
 * Variants are inferred from the visualization type. Anything we don't have
 * a tailored variant for falls back to the generic chart skeleton.
 */

function CounterSkeleton() {
  return (
    <div className="jrny-skeleton jrny-skeleton-counter" role="status" aria-live="polite">
      <div className="jrny-skeleton-shimmer jrny-skeleton-counter-value" />
      <div className="jrny-skeleton-shimmer jrny-skeleton-counter-label" />
      <span className="sr-only">Loading counter…</span>
    </div>
  );
}

function TableSkeleton({ rows = 8 }) {
  return (
    <div className="jrny-skeleton jrny-skeleton-table" role="status" aria-live="polite">
      <div className="jrny-skeleton-table-header">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="jrny-skeleton-shimmer jrny-skeleton-table-cell" />
        ))}
      </div>
      <div className="jrny-skeleton-table-body">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="jrny-skeleton-table-row">
            {[0, 1, 2, 3].map(j => (
              <div key={j} className="jrny-skeleton-shimmer jrny-skeleton-table-cell" />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading table…</span>
    </div>
  );
}
TableSkeleton.propTypes = { rows: PropTypes.number };

function ChartSkeleton() {
  // Bar heights chosen to look like a real chart, not a regular grid.
  const heights = [55, 80, 40, 90, 65, 30, 75, 50, 85, 45, 70, 60];
  return (
    <div className="jrny-skeleton jrny-skeleton-chart" role="status" aria-live="polite">
      <div className="jrny-skeleton-chart-axis">
        <div className="jrny-skeleton-shimmer jrny-skeleton-chart-axis-label" />
      </div>
      <div className="jrny-skeleton-chart-bars">
        {heights.map((h, i) => (
          <div
            key={i}
            className="jrny-skeleton-shimmer jrny-skeleton-chart-bar"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}

function PieSkeleton() {
  return (
    <div className="jrny-skeleton jrny-skeleton-pie" role="status" aria-live="polite">
      <div className="jrny-skeleton-shimmer jrny-skeleton-pie-circle" />
      <div className="jrny-skeleton-pie-legend">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="jrny-skeleton-shimmer jrny-skeleton-pie-legend-item" />
        ))}
      </div>
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}

function GenericSkeleton() {
  return (
    <div className="jrny-skeleton jrny-skeleton-generic" role="status" aria-live="polite">
      <Skeleton active paragraph={{ rows: 6 }} />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

const VARIANT_MAP = {
  COUNTER: CounterSkeleton,
  TABLE: TableSkeleton,
  CHART: ChartSkeleton,
  PIE: PieSkeleton,
  BOXPLOT: ChartSkeleton,
  FUNNEL: ChartSkeleton,
  WORD_CLOUD: GenericSkeleton,
  MAP: GenericSkeleton,
  CHOROPLETH: GenericSkeleton,
  SUNBURST_SEQUENCE: GenericSkeleton,
  SANKEY: GenericSkeleton,
  PIVOT: TableSkeleton,
  REPORT: GenericSkeleton,
  COHORT: GenericSkeleton,
};

export function getSkeletonVariantForType(visualizationType) {
  if (!visualizationType) return GenericSkeleton;
  const upper = String(visualizationType).toUpperCase();
  // Plotly charts whose globalSeriesType is "pie" use vizType "CHART" — we
  // can't easily detect pie here, so default to bar-style ChartSkeleton.
  return VARIANT_MAP[upper] || GenericSkeleton;
}

export default function SkeletonWidget({ visualizationType, variant }) {
  const Variant = variant
    ? VARIANT_MAP[String(variant).toUpperCase()] || GenericSkeleton
    : getSkeletonVariantForType(visualizationType);
  return <Variant />;
}

SkeletonWidget.propTypes = {
  visualizationType: PropTypes.string,
  variant: PropTypes.string,
};

SkeletonWidget.defaultProps = {
  visualizationType: null,
  variant: null,
};
