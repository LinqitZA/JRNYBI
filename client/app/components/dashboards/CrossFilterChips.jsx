// Feature #213 — Active cross-filter chip bar.
//
// Renders one removable Ant Design Tag per active cross-filter, plus a
// "Clear all" button. Sits between the dashboard parameters bar and the grid
// so the user always sees what is currently filtering their view.
//
// Hidden entirely when no cross-filters are active so the dashboard layout
// stays unchanged for users who don't use the feature.

import React from "react";
import PropTypes from "prop-types";
import Tag from "antd/lib/tag";
import Button from "antd/lib/button";

import { useCrossFilter } from "@/services/crossFilterBus";

import "./CrossFilterChips.less";

export default function CrossFilterChips() {
  const { activeFilters, clearFilter, clearAllFilters } = useCrossFilter();

  const dimensions = Object.keys(activeFilters || {});
  if (dimensions.length === 0) {
    return null;
  }

  return (
    <div
      className="dashboard-cross-filter-chips m-b-10 p-10 bg-white tiled"
      data-test="DashboardCrossFilterChips">
      <span className="cross-filter-chips-label">
        <i className="fa fa-filter" aria-hidden="true" /> Cross-filters
      </span>
      <span className="cross-filter-chips-list">
        {dimensions.map((dim) => {
          const entry = activeFilters[dim];
          const label = entry && entry.label != null ? entry.label : String(entry && entry.value);
          const sourceName = entry && entry.sourceWidgetName ? entry.sourceWidgetName : null;
          return (
            <Tag
              key={dim}
              closable
              color="blue"
              className="cross-filter-chip"
              data-test={`CrossFilterChip-${dim}`}
              onClose={(e) => {
                e.preventDefault();
                clearFilter(dim);
              }}>
              <strong>{dim}</strong>: {label}
              {sourceName && <span className="cross-filter-chip-source"> ← {sourceName}</span>}
            </Tag>
          );
        })}
      </span>
      <Button
        size="small"
        type="link"
        onClick={clearAllFilters}
        data-test="DashboardCrossFilterClearAll"
        className="cross-filter-chips-clear">
        Clear all
      </Button>
    </div>
  );
}

CrossFilterChips.propTypes = {};
