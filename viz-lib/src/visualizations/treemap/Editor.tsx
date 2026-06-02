/* eslint-disable react/prop-types */
// Feature #193: Treemap chart type (ECharts)
//
// Custom Editor — composes the shared ECharts tabs (General / Series /
// Colors / Data Labels) with a treemap-specific "Treemap" tab that exposes
// column-mapping (path or levels + value + optional color) plus layout
// knobs (drilldown depth, leaf labels, color mode, tooltip format).

import React from "react";
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";
import { Section, Select, Checkbox, Input, InputNumber } from "@/components/visualizations/editor";

import GeneralSettings from "../echarts/Editor/GeneralSettings";
import SeriesSettings from "../echarts/Editor/SeriesSettings";
import ColorsSettings from "../echarts/Editor/ColorsSettings";
import DataLabelsSettings from "../echarts/Editor/DataLabelsSettings";

function TreemapSettings({ options, data, onOptionsChange }: any) {
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);
  const mapping = options.columnMapping || {};

  // Auto-detect a sensible default value column name when nothing is mapped.
  const valuePlaceholder =
    colNames.find((n: string) => /value|amount|total|sum|count/i.test(n)) ||
    colNames[colNames.length - 1] ||
    "value";

  const renderColumnSelect = (
    label: string,
    key: string,
    placeholder: string,
    multi = false,
    extra: any = {}
  ) => (
    // @ts-expect-error Section children typing
    <Section>
      <Select
        label={label}
        data-test={`Treemap.Mapping.${key}`}
        mode={multi ? "multiple" : "default"}
        allowClear
        showSearch
        placeholder={placeholder}
        defaultValue={mapping[key]}
        onChange={(value: any) =>
          onOptionsChange({ columnMapping: { ...mapping, [key]: value || null } })
        }
        {...extra}>
        {colNames.map((c: string) => (
          // @ts-expect-error Select.Option typing
          <Select.Option key={c} value={c} data-test={`Treemap.Mapping.${key}.${c}`}>{c}</Select.Option>
        ))}
      </Select>
    </Section>
  );

  return (
    <React.Fragment>
      {renderColumnSelect("Path column (parent>child string)", "path", "e.g. category_path")}
      {renderColumnSelect(
        "Level columns (ordered — alternative to a single path)",
        "levels",
        "e.g. category, subcategory",
        true
      )}
      {renderColumnSelect("Value column (rectangle size)", "value", valuePlaceholder)}
      {renderColumnSelect(
        "Color value column (optional, drives gradient)",
        "color",
        "e.g. growth_pct"
      )}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Path separator"
          data-test="Treemap.PathSeparator"
          placeholder=">"
          defaultValue={options.pathSeparator || ">"}
          onChange={(event: any) =>
            onOptionsChange({ pathSeparator: event.target.value || ">" })
          }
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Drilldown depth (levels visible without zoom)"
          data-test="Treemap.DrilldownDepth"
          min={1}
          max={8}
          defaultValue={typeof options.drilldownDepth === "number" ? options.drilldownDepth : 2}
          onChange={(value: any) => onOptionsChange({ drilldownDepth: Number(value) || 2 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Treemap.ShowLeafLabels"
          defaultChecked={options.showLeafLabels !== false}
          onChange={(event: any) => onOptionsChange({ showLeafLabels: event.target.checked })}>
          Show labels on leaf rectangles
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Treemap.DropEmpty"
          defaultChecked={!!options.dropEmpty}
          onChange={(event: any) => onOptionsChange({ dropEmpty: event.target.checked })}>
          Drop rows with zero / negative values
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Color mode"
          data-test="Treemap.ColorMode"
          defaultValue={options.colorMode || "categorical"}
          onChange={(value: any) => onOptionsChange({ colorMode: value })}>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="categorical">Categorical (palette)</Select.Option>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="gradient">Gradient (uses Color Value column)</Select.Option>
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Tooltip template (use {path}, {name}, {value})"
          data-test="Treemap.TooltipFormat"
          placeholder="(default)"
          defaultValue={options.tooltipFormat || ""}
          onChange={(event: any) =>
            onOptionsChange({ tooltipFormat: event.target.value || "" })
          }
        />
      </Section>
    </React.Fragment>
  );
}

export default createTabbedEditor([
  { key: "General", title: "General", component: GeneralSettings },
  { key: "Treemap", title: "Treemap", component: TreemapSettings },
  { key: "Series", title: "Series", component: SeriesSettings },
  { key: "Colors", title: "Colors", component: ColorsSettings },
  { key: "DataLabels", title: "Data Labels", component: DataLabelsSettings },
]);
