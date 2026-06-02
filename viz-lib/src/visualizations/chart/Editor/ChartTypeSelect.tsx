import { filter, includes, map } from "lodash";
import React, { useMemo } from "react";
import { Select } from "@/components/visualizations/editor";
import { visualizationsSettings } from "@/visualizations/visualizationsSettings";

// Feature #215 — Auto chart-type suggestion. The editor renders a
// "Recommended" inline tag next to the suggested type so the picker
// always shows which option the heuristic prefers, without hijacking the
// user's current selection.

const allChartTypes = [
  { type: "line", name: "Line", icon: "line-chart" },
  { type: "column", name: "Bar", icon: "bar-chart" },
  { type: "area", name: "Area", icon: "area-chart" },
  { type: "pie", name: "Pie", icon: "pie-chart" },
  { type: "scatter", name: "Scatter", icon: "circle-o" },
  { type: "bubble", name: "Bubble", icon: "circle-o" },
  { type: "heatmap", name: "Heatmap", icon: "th" },
  { type: "box", name: "Box", icon: "square-o" },
  // Feature #198: Waterfall (bridge) chart — relative/total/absolute measures
  { type: "waterfall", name: "Waterfall", icon: "signal" },
  // Feature #199: Bullet graph — actual-vs-target with qualitative bands (KPI scorecard)
  { type: "bullet", name: "Bullet", icon: "tasks" },
  // Feature #204: Slope / connected-scatter — before-vs-after for many entities at once
  { type: "slope", name: "Slope", icon: "exchange" },
  // Feature #205: Combo (dual-axis) — mix bar + line on one chart, two y-axes
  { type: "combo", name: "Combo", icon: "bar-chart" },
];

type OwnProps = {
  hiddenChartTypes?: any[]; // TODO: PropTypes.oneOf(map(allChartTypes, "type"))
  // Feature #215 — when set, render a "Recommended" tag next to the option
  // whose `type` matches. Purely visual; selection still flows through the
  // standard onChange path.
  suggestedType?: string | null;
};

const chartTypeSelectDefaultProps = {
  hiddenChartTypes: [],
  suggestedType: null as string | null,
};

type Props = OwnProps & typeof chartTypeSelectDefaultProps;

export default function ChartTypeSelect({ hiddenChartTypes, suggestedType, ...props }: Props) {
  const chartTypes = useMemo(() => {
    const result = [...allChartTypes];

    if (visualizationsSettings.allowCustomJSVisualizations) {
      result.push({ type: "custom", name: "Custom", icon: "code" });
    }

    if (hiddenChartTypes.length > 0) {
      return filter(result, ({ type }) => !includes(hiddenChartTypes, type));
    }

    return result;
  }, []);

  return (
    <Select {...props}>
      {map(chartTypes, ({ type, name, icon }) => (
        // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message
        <Select.Option key={type} value={type} data-test={`Chart.ChartType.${type}`}>
          <i className={`fa fa-${icon}`} style={{ marginRight: 5 }} />
          {name}
          {suggestedType === type && (
            <span
              className="chart-type-recommended-tag"
              data-test={`Chart.ChartType.${type}.Recommended`}
              style={{
                marginLeft: 8,
                padding: "0 6px",
                borderRadius: 10,
                background: "#e6f4ff",
                color: "#1677ff",
                fontSize: 11,
                fontWeight: 600,
              }}>
              Recommended
            </span>
          )}
          {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
        </Select.Option>
      ))}
    </Select>
  );
}

ChartTypeSelect.defaultProps = chartTypeSelectDefaultProps;
