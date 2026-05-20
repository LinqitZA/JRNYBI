import _ from "lodash";
import {
  getDefaultFormatOptions,
  getColumnsOptions,
} from "@/visualizations/shared/columnUtils";

export interface MetricCard {
  id: string;
  label: string;
  column: string;
  aggregation: "SUM" | "COUNT" | "AVG" | "MIN" | "MAX" | "FIRST" | "LAST";
  format: "number" | "currency" | "percentage" | "date";
  decimalPlaces: number;
  conditionalFormatting: boolean;
  positiveColor: string;
  negativeColor: string;
}

export const DEFAULT_METRIC_CARD: MetricCard = {
  id: "",
  label: "",
  column: "",
  aggregation: "SUM",
  format: "number",
  decimalPlaces: 2,
  conditionalFormatting: false,
  positiveColor: "#16a34a",
  negativeColor: "#dc2626",
};

const DEFAULT_OPTIONS = {
  itemsPerPage: 25,
  paginationSize: "default",
  metricCards: [] as MetricCard[],
};

export default function getOptions(options: any, { columns }: any) {
  options = { ...DEFAULT_OPTIONS, ...options };

  // Ensure each metric card has all required fields with defaults
  options.metricCards = _.map(options.metricCards || [], (card: any) => ({
    ...DEFAULT_METRIC_CARD,
    ...card,
  }));

  // Process table columns (reuse shared column utils like TABLE does)
  options.columns = _.map(getColumnsOptions(columns, options.columns, { allowSearch: false }), (col: any) => ({
    ...getDefaultFormatOptions(col),
    ...col,
  }));

  return options;
}
