// Pure helpers for "Download as Excel (as shown)".
// See docs/superpowers/specs/2026-10-21-jrnybi-excel-as-shown-design.md in the JRNY repo.
import moment from "moment";
import { find, isArray, isFunction, isNil, isPlainObject, orderBy } from "lodash";

// Visualizations whose Renderer can give an ExportGrid (viz-lib sets exportRef.current = { getGrid }).
export const EXPORTABLE_VISUALIZATION_TYPES = ["PIVOT", "TABLE"];

// The names viz-lib gives a new visualization of each exportable type. A visualization still carrying
// its default name adds nothing to the export title.
const DEFAULT_VISUALIZATION_NAMES = {
  PIVOT: "Pivot Table",
  TABLE: "Table",
};

// What the query page tabs show when a query has no saved visualization (QueryVisualizationTabs).
const DEFAULT_QUERY_VISUALIZATION = { type: "TABLE", name: "Table", id: null, options: {} };

const MAX_FILE_NAME_LENGTH = 150;

export function canExportAsShown({ visualizationType, isQueryResultEmpty }) {
  return !isQueryResultEmpty && EXPORTABLE_VISUALIZATION_TYPES.includes(visualizationType);
}

export function formatParameterValue(value) {
  if (isNil(value) || value === "") {
    return null;
  }
  if (isArray(value)) {
    return value.length > 0 ? value.join(", ") : null;
  }
  if (isPlainObject(value) && ("start" in value || "end" in value)) {
    return `${value.start ?? ""} – ${value.end ?? ""}`;
  }
  return String(value);
}

// "Name: value · Name: value · Exported 21 Oct 2026 20:40". `parameters` are client Parameter objects;
// their execution value is the one the visualization's query result was run with.
export function buildExportSubtitle(parameters, now = new Date()) {
  const parts = [];
  (parameters || []).forEach((param) => {
    if (!param || !isFunction(param.getExecutionValue)) {
      return;
    }
    const value = formatParameterValue(param.getExecutionValue());
    if (value !== null) {
      parts.push(`${param.title || param.name}: ${value}`);
    }
  });
  parts.push(`Exported ${moment(now).format("D MMM YYYY HH:mm")}`);
  return parts.join(" · ");
}

export function buildExportTitle(queryName, visualization) {
  const name = (queryName || "").trim();
  const visName = ((visualization && visualization.name) || "").trim();
  const isDefaultVisName = !visName || visName === DEFAULT_VISUALIZATION_NAMES[visualization && visualization.type];
  if (name && !isDefaultVisName) {
    return `${name} – ${visName}`;
  }
  return name || visName || "Export";
}

export function sanitizeExcelFileName(title) {
  const cleaned = String(title || "")
    // characters Windows/macOS/Linux don't allow in a file name, and control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  return `${cleaned || "export"}.xlsx`;
}

// The visualization the query page tabs show for `selectedTab` (same fallbacks as QueryVisualizationTabs).
export function resolveSelectedVisualization(visualizations, selectedTab) {
  if (!visualizations || visualizations.length === 0) {
    return { ...DEFAULT_QUERY_VISUALIZATION };
  }
  return find(visualizations, { id: selectedTab }) || orderBy(visualizations, ["id"])[0];
}
