/**
 * Shared ECharts <Renderer /> wrapper.
 *
 * Consumed by every ECharts-based visualization in JRNYBI. Each viz only
 * needs to supply a `getOption(data, options)` function — the wrapper
 * handles:
 *   - module registration (lazy / idempotent)
 *   - sizing (auto-fit to parent container, ResizeObserver-driven re-render)
 *   - theme selection ("jrny-light" / "jrny-dark", switchable at runtime)
 *   - locale
 *   - cleanup on unmount
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";

import { registerEChartsModules, echarts } from "./index";

export type EChartsTheme = "jrny-light" | "jrny-dark" | string | object;

export interface EChartsRendererProps {
  /** Function that produces an ECharts option object from data + options. */
  getOption: (data: any, options: any) => any;
  /** Underlying data passed to getOption(). Triggers re-render on change. */
  data: any;
  /** Visualization options passed to getOption(). Triggers re-render on change. */
  options: any;
  /** Theme name or theme object. Defaults to "jrny-light". */
  theme?: EChartsTheme;
  /** Renderer backend. "svg" is the default — cheaper for small charts. */
  renderer?: "canvas" | "svg";
  /** Locale code, e.g. "en". Defaults to "en". */
  locale?: string;
  /** Optional callback fired once the chart instance is ready. */
  onChartReady?: (instance: any) => void;
  /** Loading spinner. */
  loading?: boolean;
  /** Optional CSS class on the wrapping div. */
  className?: string;
  /** Optional inline style on the wrapping div. */
  style?: React.CSSProperties;
}

const DEFAULT_STYLE: React.CSSProperties = { width: "100%", height: "100%", minHeight: 200 };

const EChartsRenderer: React.FC<EChartsRendererProps> = ({
  getOption,
  data,
  options,
  theme = "jrny-light",
  renderer = "svg",
  locale = "en",
  onChartReady,
  loading = false,
  className,
  style,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  // bumps each time the parent container resizes so the inner chart re-fits.
  const [resizeKey, setResizeKey] = useState(0);

  // Make sure ECharts modules are registered exactly once before first render.
  // useMemo runs synchronously during render which is what we want here.
  useMemo(() => registerEChartsModules(), []);

  // Recompute option whenever data or options change.
  const option = useMemo(() => {
    try {
      return getOption(data, options);
    } catch (err) {
      // Surface a minimal "broken chart" state instead of crashing the
      // dashboard if a viz's getOption() throws on unexpected data.
      // eslint-disable-next-line no-console
      console.error("ECharts getOption failed:", err);
      return { title: { text: "Chart error", left: "center", top: "center" } };
    }
  }, [getOption, data, options]);

  const handleReady = useCallback(
    (instance: any) => {
      chartRef.current = instance;
      if (onChartReady) onChartReady(instance);
    },
    [onChartReady]
  );

  // Feature #213 — cross-filter on click.
  //
  // ECharts uses an event-bus style: `chart.on('click', handler)`. We attach
  // exactly one listener that translates the click into a (dimension, value)
  // dispatch through options.onCrossFilter. Dimension defaults to the chart's
  // `xColumn` (or `categoryColumn` for tree/sunburst/treemap-style vizes), and
  // value comes from the clicked point's data array (params.data is the row
  // that produced the slice/bar/cell).
  //
  // The handler is re-attached every time options change so that updates to
  // options.onCrossFilter (e.g. when the host re-creates the callback) are
  // picked up. ECharts replays no events on attach so this is cheap.
  useEffect(() => {
    const instance = chartRef.current;
    if (!instance || typeof instance.on !== "function") return undefined;
    if (typeof options !== "object" || !options) return undefined;
    // Attach when EITHER cross-filter OR drill-down is wired by the host.
    // Both call-paths funnel through the same `click` handler below.
    const hasCrossFilter =
      typeof options.onCrossFilter === "function" &&
      options.crossFilter !== false &&
      !(options.crossFilter && options.crossFilter.enabled === false);
    const hasDrillDown =
      typeof options.onDrillDown === "function" &&
      options.drillDown &&
      options.drillDown.target &&
      options.drillDown.enabled !== false;
    if (!hasCrossFilter && !hasDrillDown) return undefined;

    const handler = (params: any) => {
      // Feature #214 — drill-down via the same click handler. If the host
      // wired a drill-down target onto the viz, dispatch the click's row
      // first (it takes precedence over cross-filter, since a drill-down
      // navigates away — running the cross-filter dispatch as well would
      // pollute the parent dashboard's bus).
      try {
        if (
          typeof options.onDrillDown === "function" &&
          options.drillDown &&
          options.drillDown.target
        ) {
          let row: any = null;
          if (params && params.data && typeof params.data === "object" && !Array.isArray(params.data)) {
            row = params.data;
          } else if (params && Array.isArray(params.value)) {
            row = { value: params.value, name: params.name };
          } else if (params) {
            row = { value: params.value, name: params.name };
          }
          options.onDrillDown(row, { echartsParams: params });
          return;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("ECharts drill-down dispatch failed:", err);
      }

      if (typeof options.onCrossFilter !== "function") return;
      try {
        const dimension =
          (options.crossFilter && options.crossFilter.dimension) ||
          options.xColumn ||
          options.categoryColumn ||
          "x";
        // ECharts hands back the row that produced the slice in params.data
        // for tree/treemap/sunburst, and an array [x, y, ...] for cartesian
        // charts. Reach for the named field first, fall back to params.name
        // (the categorical axis label) then params.value[0].
        let value: any;
        if (params && params.data && typeof params.data === "object" && !Array.isArray(params.data)) {
          value = params.data[dimension] != null ? params.data[dimension] : params.name;
        } else if (params && params.value != null) {
          value = Array.isArray(params.value) ? params.value[0] : params.value;
        } else if (params) {
          value = params.name;
        }
        if (value === undefined) return;
        options.onCrossFilter(dimension, value, { label: params && params.name });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("ECharts cross-filter dispatch failed:", err);
      }
    };

    instance.on("click", handler);
    return () => {
      try {
        instance.off("click", handler);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, resizeKey]);

  // ResizeObserver -> bump resizeKey -> echarts-for-react resizes underlying chart.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (chartRef.current && typeof chartRef.current.resize === "function") {
        chartRef.current.resize();
      } else {
        setResizeKey((k) => k + 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dispose chart on unmount to free memory.
  useEffect(() => {
    return () => {
      if (chartRef.current && typeof chartRef.current.dispose === "function") {
        try {
          chartRef.current.dispose();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return (
    <div ref={wrapperRef} className={className} style={{ ...DEFAULT_STYLE, ...style }}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ width: "100%", height: "100%" }}
        theme={theme}
        opts={{ renderer, locale }}
        onChartReady={handleReady}
        showLoading={loading}
        key={resizeKey}
      />
    </div>
  );
};

export default EChartsRenderer;
