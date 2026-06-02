// Feature #213 — Dashboard-wide cross-filter bus.
//
// Holds the active cross-filter selections on a dashboard. When a user clicks
// a chart element / table row in one widget, the click handler dispatches a
// (dimension, value, sourceWidgetId) entry here. Every other widget reads from
// this bus and applies the active filters as additional WHERE-clause-like
// predicates (using either query parameters or client-side row filtering).
//
// The provider lives at the DashboardPage level so the bus is scoped to one
// dashboard (multiple dashboards in tabs don't bleed into each other).
//
// Shape of the active-filters map:
//   {
//     [dimension: string]: {
//       value: any,
//       label?: string,
//       sourceWidgetId: number | string,
//       sourceWidgetName?: string,
//     }
//   }
//
// `dimension` is the column name used for cross-filtering. By default a chart
// dispatches on its `x` column; widgets receive a filter when any of their
// own columns matches the dimension name (case-insensitive). See
// docs/cross-filter.md for the full column-mapping convention.

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import PropTypes from "prop-types";

const CrossFilterContext = createContext({
  activeFilters: {},
  dispatchFilter: () => {},
  clearFilter: () => {},
  clearAllFilters: () => {},
});

export function CrossFilterProvider({ children }) {
  const [activeFilters, setActiveFilters] = useState({});

  const dispatchFilter = useCallback((dimension, value, meta = {}) => {
    if (!dimension) {
      return;
    }
    setActiveFilters((prev) => {
      const existing = prev[dimension];
      // Toggle-off: clicking the same dimension+value clears that filter.
      // This matches the standard BI cross-filter UX (Power BI / Tableau /
      // Superset all behave this way).
      if (existing && existing.value === value) {
        const next = { ...prev };
        delete next[dimension];
        return next;
      }
      return {
        ...prev,
        [dimension]: {
          value,
          label: meta.label != null ? String(meta.label) : String(value),
          sourceWidgetId: meta.sourceWidgetId != null ? meta.sourceWidgetId : null,
          sourceWidgetName: meta.sourceWidgetName || null,
        },
      };
    });
  }, []);

  const clearFilter = useCallback((dimension) => {
    setActiveFilters((prev) => {
      if (!(dimension in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[dimension];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, []);

  const value = useMemo(
    () => ({ activeFilters, dispatchFilter, clearFilter, clearAllFilters }),
    [activeFilters, dispatchFilter, clearFilter, clearAllFilters]
  );

  return <CrossFilterContext.Provider value={value}>{children}</CrossFilterContext.Provider>;
}

CrossFilterProvider.propTypes = {
  children: PropTypes.node,
};

CrossFilterProvider.defaultProps = {
  children: null,
};

// Hook for widgets / chart renderers to read the active filter map and the
// dispatch callbacks. Safe to call outside the provider — it falls back to
// a noop bus so non-dashboard contexts (Query page, ExpandedWidgetDialog when
// opened from /queries) continue to work unchanged.
export function useCrossFilter() {
  return useContext(CrossFilterContext);
}

// Helpers consumed by the VisualizationRenderer to compute which filters
// should apply to a widget, given the widget's own column list and id.

// A widget receives a cross-filter when:
//   1. The filter's source widget is NOT this widget (a widget never filters
//      itself on its own click — clicks toggle the filter, not the data the
//      user is looking at).
//   2. The widget's data has a column matching the filter's dimension name
//      (case-insensitive). If the widget has no matching column, the filter
//      simply doesn't apply — this is the "shared dimension" convention.
export function filtersApplyingToWidget(activeFilters, widgetId, columnNames) {
  const out = {};
  if (!activeFilters) return out;
  const normalised = (columnNames || []).reduce((acc, name) => {
    if (name) acc[String(name).toLowerCase()] = name;
    return acc;
  }, {});
  Object.keys(activeFilters).forEach((dimension) => {
    const entry = activeFilters[dimension];
    if (entry == null) return;
    if (widgetId != null && entry.sourceWidgetId != null && entry.sourceWidgetId === widgetId) {
      // Don't filter the source widget by its own click — keeps the user
      // oriented (they can still see the original chart's full distribution
      // with the selected slice highlighted via the chip bar).
      return;
    }
    const matchedColumn = normalised[String(dimension).toLowerCase()];
    if (!matchedColumn) return;
    out[matchedColumn] = entry.value;
  });
  return out;
}

// Apply the cross-filter map to a row array. Rows where every active filter's
// column matches the corresponding value are kept; everything else is dropped.
// String comparison is case-insensitive; everything else is strict equality
// after JSON-stringification (handles numbers, dates that serialise the same
// way the chart receives them).
export function applyCrossFiltersToRows(rows, filtersForWidget) {
  const keys = Object.keys(filtersForWidget || {});
  if (keys.length === 0) return rows;
  return rows.filter((row) =>
    keys.every((col) => {
      const expected = filtersForWidget[col];
      const actual = row != null ? row[col] : undefined;
      if (expected == null && actual == null) return true;
      if (expected == null || actual == null) return false;
      if (typeof expected === "string" && typeof actual === "string") {
        return expected.toLowerCase() === actual.toLowerCase();
      }
      // Fallback: stringified equality — covers numbers, booleans, dates
      // that the chart already coerced to a primitive.
      return String(expected) === String(actual);
    })
  );
}

export default CrossFilterContext;
