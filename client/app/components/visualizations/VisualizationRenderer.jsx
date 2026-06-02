import { isEqual, map, find, fromPairs } from "lodash";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import useQueryResultData from "@/lib/useQueryResultData";
import useImmutableCallback from "@/lib/hooks/useImmutableCallback";
import Filters, { FiltersType, filterData } from "@/components/Filters";
import { VisualizationType } from "@redash/viz/lib";
import { Renderer } from "@/components/visualizations/visualizationComponents";

// Feature #213 — cross-filter bus integration.
// VisualizationRenderer is the single chokepoint where (a) every widget's
// data is computed and (b) options are handed to the underlying viz library.
// We hook in here so each widget can both DISPATCH a cross-filter on click
// AND RECEIVE active cross-filters from other widgets as additional row
// predicates. The chart renderers (Plotly / ECharts / AG-Grid) call back
// into options.onCrossFilter(dimension, value, meta) and the bus does the
// rest. Default x-column is the dispatch dimension unless the viz options
// override via options.crossFilter.dimension.
import {
  useCrossFilter,
  filtersApplyingToWidget,
  applyCrossFiltersToRows,
} from "@/services/crossFilterBus";

// Feature #214 — drill-down navigation. When a visualization has a
// drillDown.target configured, clicks dispatched via options.onDrillDown
// translate the clicked row into target-page parameters and navigate, while
// pushing the current dashboard onto the breadcrumb stack in the URL.
import navigateTo from "@/components/ApplicationArea/navigateTo";
import location from "@/services/location";
import {
  buildDrillDownUrl,
  readDrillStack,
  resolveDrillParameters,
  resolveDrillTargetPath,
} from "@/services/drillDown";

function combineFilters(localFilters, globalFilters) {
  // tiny optimization - to avoid unnecessary updates
  if (localFilters.length === 0 || globalFilters.length === 0) {
    return localFilters;
  }

  return map(localFilters, localFilter => {
    const globalFilter = find(globalFilters, f => f.name === localFilter.name);
    if (globalFilter) {
      return {
        ...localFilter,
        current: globalFilter.current,
      };
    }
    return localFilter;
  });
}

function areFiltersEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  a = fromPairs(map(a, item => [item.name, item]));
  b = fromPairs(map(b, item => [item.name, item]));

  return isEqual(a, b);
}

export default function VisualizationRenderer(props) {
  const data = useQueryResultData(props.queryResult);
  const [filters, setFilters] = useState(() => combineFilters(data.filters, props.filters)); // lazy initialization
  const filtersRef = useRef();
  filtersRef.current = filters;

  const handleFiltersChange = useImmutableCallback(newFilters => {
    if (!areFiltersEqual(newFilters, filters)) {
      setFilters(newFilters);
      props.onFiltersChange(newFilters);
    }
  });

  // Reset local filters when query results updated
  useEffect(() => {
    handleFiltersChange(combineFilters(data.filters, props.filters));
  }, [data.filters, props.filters, handleFiltersChange]);

  // Update local filters when global filters changed.
  // For correct behavior need to watch only `props.filters` here,
  // therefore using ref to access current local filters
  useEffect(() => {
    handleFiltersChange(combineFilters(filtersRef.current, props.filters));
  }, [props.filters, handleFiltersChange]);

  // -------------------------------------------------------------------------
  // Feature #213 — cross-filter wiring.
  // -------------------------------------------------------------------------
  // `useCrossFilter` falls back to a noop bus when used outside a
  // CrossFilterProvider, so the Query-page (non-dashboard) renderer remains
  // a true no-op for this feature — no new behavior on /queries/:id.
  const { activeFilters, dispatchFilter } = useCrossFilter();
  const { widgetId, widgetName } = props;

  // Stable dispatch callback that includes widget identity so the bus can
  // skip applying the filter back onto the originating widget.
  const handleCrossFilter = useCallback(
    (dimension, value, meta = {}) => {
      if (dimension == null) return;
      dispatchFilter(dimension, value, {
        ...meta,
        sourceWidgetId: meta.sourceWidgetId != null ? meta.sourceWidgetId : widgetId,
        sourceWidgetName: meta.sourceWidgetName || widgetName,
      });
    },
    [dispatchFilter, widgetId, widgetName]
  );

  // Compute which active filters apply to this widget (intersection of the
  // widget's columns and the active dimension set, minus the widget's own
  // dispatches).
  const filtersForWidget = useMemo(() => {
    const columnNames = (data.columns || []).map(c => c.name);
    return filtersApplyingToWidget(activeFilters, widgetId, columnNames);
  }, [activeFilters, widgetId, data.columns]);

  const filteredData = useMemo(() => {
    let rows = filterData(data.rows, filters);
    // Apply cross-filters AFTER local Filters so the user's explicit local
    // filter UI takes precedence and cross-filters narrow further.
    rows = applyCrossFiltersToRows(rows, filtersForWidget);
    return {
      columns: data.columns,
      rows,
    };
  }, [data, filters, filtersForWidget]);

  const { showFilters, visualization } = props;

  let options = { ...visualization.options };

  // define pagination size based on context for Table visualization
  if (visualization.type === "TABLE") {
    options.paginationSize = props.context === "widget" ? "small" : "default";

    // Feature #211 — server-side virtualisation needs the query-result id to
    // talk to POST /api/query_results/<id>/page. The Renderer is otherwise
    // data-only, so we plumb the id through `options.queryResultId` here at
    // the host layer (where we actually have the QueryResult object).
    if (options.enableServerSideVirtualization) {
      const resultId =
        (props.queryResult && typeof props.queryResult.getId === "function" && props.queryResult.getId()) ||
        (props.queryResult && props.queryResult.query_result && props.queryResult.query_result.id) ||
        (props.queryResult && props.queryResult.id) ||
        null;
      if (resultId) options.queryResultId = resultId;
    }
  }

  // ---------------------------------------------------------------------
  // Feature #214 — drill-down click handler.
  // ---------------------------------------------------------------------
  // The chart calls onDrillDown(sourceRow, meta) when the user clicks an
  // element on a viz with drillDown.target configured. We resolve the target
  // path, map row columns to URL params via drillDown.parameterMapping, and
  // navigate while pushing the current dashboard onto the breadcrumb stack.
  const handleDrillDown = useCallback(
    (sourceRow, meta = {}) => {
      const drillCfg = (visualization && visualization.options && visualization.options.drillDown) || null;
      if (!drillCfg || !drillCfg.target) return;
      if (drillCfg.enabled === false) return;
      const targetPath = resolveDrillTargetPath(drillCfg.target);
      if (!targetPath) return;
      const targetParams = resolveDrillParameters(drillCfg.parameterMapping, sourceRow, meta && meta.fallback);

      // Build the current URL (path + search + hash) so we can stash it as
      // the breadcrumb parent step. location.url is kept in sync by the
      // location service.
      const currentUrl = location.url || `${location.path || ""}`;
      // Use the dashboard's name if the host provided one via widgetName
      // (we set widgetName from widget.getQuery().name on the dashboard).
      // The breadcrumb chip shows the dashboard the user came FROM — use
      // the document title as a stable fallback when nothing else is set.
      const parentName =
        (meta && meta.parentName) ||
        (drillCfg.parentName) ||
        (typeof document !== "undefined" && document.title) ||
        "Previous";
      const existingStack = readDrillStack(typeof window !== "undefined" ? window.location.search : "");
      const url = buildDrillDownUrl({
        currentUrl,
        currentName: parentName,
        targetPath,
        targetParams,
        existingStack,
      });
      navigateTo(url);
    },
    [visualization]
  );

  // Inject cross-filter hooks into the options object passed to the chart
  // renderer. We only do this on dashboards (context === "widget") so the
  // query editor preview doesn't surface dispatch buttons that wouldn't
  // have anywhere to dispatch to.
  if (props.context === "widget") {
    options = {
      ...options,
      onCrossFilter: handleCrossFilter,
      activeCrossFilters: filtersForWidget,
      crossFilterSource: {
        widgetId: widgetId != null ? widgetId : null,
        widgetName: widgetName || null,
      },
      onDrillDown: handleDrillDown,
    };
  }

  return (
    <Renderer
      key={`visualization${visualization.id}`}
      type={visualization.type}
      options={options}
      data={filteredData}
      visualizationName={visualization.name}
      addonBefore={showFilters && <Filters filters={filters} onChange={handleFiltersChange} />}
    />
  );
}

VisualizationRenderer.propTypes = {
  visualization: VisualizationType.isRequired,
  queryResult: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  showFilters: PropTypes.bool,
  filters: FiltersType,
  onFiltersChange: PropTypes.func,
  context: PropTypes.oneOf(["query", "widget"]).isRequired,
  // Feature #213 — widget identity, only set when rendered inside a dashboard.
  widgetId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  widgetName: PropTypes.string,
};

VisualizationRenderer.defaultProps = {
  showFilters: true,
  filters: [],
  onFiltersChange: () => {},
  widgetId: null,
  widgetName: null,
};
