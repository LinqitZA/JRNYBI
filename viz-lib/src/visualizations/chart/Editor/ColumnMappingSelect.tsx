import { isString, map, uniq, flatten, filter, sortBy } from "lodash";
import React from "react";
import { Section, Select } from "@/components/visualizations/editor";

const MappingTypes = {
  x: { label: "X Column" },
  y: { label: "Y Columns", multiple: true },
  series: { label: "Group by" },
  yError: { label: "Errors column" },
  size: { label: "Bubble Size Column" },
  zVal: { label: "Color Column" },
  // Feature #198: Waterfall — per-point measure ('relative'/'total'/'absolute')
  measure: { label: "Measure Column" },
  // Feature #199: Bullet graph — actual vs target with qualitative bands
  actualValue: { label: "Actual Value Column" },
  targetValue: { label: "Target Value Column" },
  bandLower: { label: "Poor / Satisfactory Threshold Column" },
  bandUpper: { label: "Satisfactory / Good Threshold Column" },
  // Feature #200: Forecast band columns (line chart with confidence interval)
  forecastValue: { label: "Forecast Value Column" },
  forecastLower: { label: "Forecast Lower Bound Column" },
  forecastUpper: { label: "Forecast Upper Bound Column" },
  // Feature #202: Small multiples / trellis — column whose unique values split
  // the chart into a grid of subplots
  facet: { label: "Facet Column (split into subplots)" },
};

const SwappedMappingTypes = {
  ...MappingTypes,
  x: { label: "Y Column" },
  y: { label: "X Columns", multiple: true },
};

type OwnProps = {
  value?: string | string[];
  availableColumns?: string[];
  type?: any; // TODO: PropTypes.oneOf(keys(MappingTypes))
  onChange?: (...args: any[]) => any;
};

const columnMappingSelectDefaultProps = {
  value: null,
  availableColumns: [],
  type: null,
  onChange: () => {},
};

type Props = OwnProps & typeof columnMappingSelectDefaultProps;

export default function ColumnMappingSelect({ value, availableColumns, type, onChange, areAxesSwapped }: Props) {
  const options = sortBy(filter(uniq(flatten([availableColumns, value])), v => isString(v) && v !== ""));

  // this swaps the ui, as the data will be swapped on render
  const { label, multiple } = !areAxesSwapped ? MappingTypes[type] : SwappedMappingTypes[type];

  return (
    // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
    <Section>
      <Select
        label={label}
        data-test={`Chart.ColumnMapping.${type}`}
        mode={multiple ? "multiple" : "default"}
        allowClear
        showSearch
        placeholder={multiple ? "Choose columns..." : "Choose column..."}
        value={value || undefined}
        // @ts-expect-error ts-migrate(2349) FIXME: This expression is not callable.
        onChange={(column: any) => onChange(column || null, type)}>
        {map(options, c => (
          // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message
          <Select.Option key={c} value={c} data-test={`Chart.ColumnMapping.${type}.${c}`}>
            {c}
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
          </Select.Option>
        ))}
      </Select>
    </Section>
  );
}

ColumnMappingSelect.defaultProps = columnMappingSelectDefaultProps;

ColumnMappingSelect.MappingTypes = MappingTypes;
