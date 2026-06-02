import _ from "lodash";
import {
  getDefaultFormatOptions,
  getColumnsOptions,
} from "@/visualizations/shared/columnUtils";
import { JrnySemantic } from "@/visualizations/ColorPalette";

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
  // Pulled from the JRNY semantic token palette (jrny-theme.less mirrors
  // these values). Keeps Counter / metric-card conditional formatting in
  // sync with the rest of the BI surface and ensures WCAG-AA contrast.
  positiveColor: JrnySemantic.positive,
  negativeColor: JrnySemantic.negative,
};

const DEFAULT_OPTIONS = {
  itemsPerPage: 25,
  paginationSize: "default",
  metricCards: [] as MetricCard[],
  reportCategory: "" as string,
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
