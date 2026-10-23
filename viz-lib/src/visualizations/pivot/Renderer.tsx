import React, { useState, useEffect, useMemo, useRef } from "react";
import { get, find, pick, map, mapValues } from "lodash";
import PivotTableUI from "react-pivottable/PivotTableUI";
import TableRenderers from "react-pivottable/TableRenderers";
import { RendererPropTypes } from "@/visualizations/prop-types";
import { formatColumnValue } from "@/lib/utils";
import { pivotExportGrid, ExportGridSource } from "@/lib/export-grid";
import createPlotlyComponent from "react-plotly.js/factory";
import createPlotlyRenderers from "react-pivottable/PlotlyRenderers";
import { Plotly } from "@/visualizations/chart/plotly";

import "react-pivottable/pivottable.css";
import "./renderer.less";

const Plot = createPlotlyComponent(Plotly);
const PlotlyRenderers = createPlotlyRenderers(Plot);
const RENDERERS = Object.assign({}, TableRenderers, PlotlyRenderers);

const VALID_OPTIONS = [
  "rows",
  "cols",
  "vals",
  "aggregatorName",
  "valueFilter",
  "sorters",
  "rowOrder",
  "colOrder",
  "derivedAttributes",
  "rendererName",
  "hiddenAttributes",
  "hiddenFromAggregators",
  "hiddenFromDragDrop",
  "menuLimit",
  "unusedOrientationCutoff",
  "controls",
  "rendererOptions",
];

function formatRows({ rows, columns }: any) {
  return map(rows, (row) =>
    mapValues(row, (value, key) => formatColumnValue(value, find(columns, { name: key }).type))
  );
}

export default function Renderer({ data, options, onOptionsChange, exportRef }: any) {
  const [config, setConfig] = useState({ ...options });
  const dataRows = useMemo(() => formatRows(data), [data]);

  // "Download as Excel (as shown)": getGrid always reads the latest render's
  // config (including pivot-control changes) and data.
  const exportStateRef = useRef({ config, dataRows, options });
  exportStateRef.current = { config, dataRows, options };

  useEffect(() => {
    if (!exportRef) return undefined;
    const source: ExportGridSource = {
      getGrid: () => {
        const { config: current, dataRows: rows, options: currentOptions } = exportStateRef.current;
        // PivotTableUI falls back to its first renderer ("Table") for an unknown name.
        const rendererName = current.rendererName in RENDERERS ? current.rendererName : undefined;
        // Totals visibility follows the same options the CSS reads below.
        const rendererOptions = get(currentOptions, "rendererOptions", current.rendererOptions);
        return pivotExportGrid({ ...current, rendererName, rendererOptions }, rows);
      },
    };
    exportRef.current = source;
    return () => {
      if (exportRef.current === source) exportRef.current = null;
    };
  }, [exportRef]);

  useEffect(() => {
    setConfig({ ...options });
  }, [options]);

  const onChange = (updatedOptions: any) => {
    const validOptions = pick(updatedOptions, VALID_OPTIONS);
    setConfig({ ...validOptions });
    onOptionsChange(validOptions);
  };

  // Legacy behavior: hideControls when controls.enabled is true
  const hideControls = get(options, "controls.enabled");
  const hideRowTotals = !get(options, "rendererOptions.table.rowTotals");
  const hideColumnTotals = !get(options, "rendererOptions.table.colTotals");
  return (
    <div
      className="pivot-table-visualization-container"
      data-hide-controls={hideControls || null}
      data-hide-row-totals={hideRowTotals || null}
      data-hide-column-totals={hideColumnTotals || null}
      data-test="PivotTableVisualization"
    >
      {/* @ts-ignore PivotTableUI types may mismatch with @types/react */}
      <PivotTableUI
        {...pick(config, VALID_OPTIONS)}
        data={dataRows}
        onChange={onChange}
        renderers={Object.assign({}, TableRenderers, PlotlyRenderers)}
      />
    </div>
  );
}

Renderer.propTypes = RendererPropTypes;
Renderer.defaultProps = { onOptionsChange: () => {} };
