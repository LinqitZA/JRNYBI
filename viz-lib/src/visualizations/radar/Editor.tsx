/* eslint-disable react/prop-types */
// Feature #197: Radar / spider chart type (ECharts)
//
// Custom Editor — composes the shared ECharts tabs (General / Series /
// Colors / Data Labels) with a radar-specific "Radar" tab that exposes
// column-mapping (wide-format: series + axes; long-format: series +
// dimension + value) plus layout knobs (scale, shape, fill opacity,
// line width, symbol/label/tick visibility).

import React from "react";
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";
import { Section, Select, Checkbox, InputNumber } from "@/components/visualizations/editor";

import GeneralSettings from "../echarts/Editor/GeneralSettings";
import SeriesSettings from "../echarts/Editor/SeriesSettings";
import ColorsSettings from "../echarts/Editor/ColorsSettings";
import DataLabelsSettings from "../echarts/Editor/DataLabelsSettings";

function RadarSettings({ options, data, onOptionsChange }: any) {
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);
  const mapping = options.columnMapping || {};

  const updateMapping = (patch: any) =>
    onOptionsChange({ columnMapping: { ...mapping, ...patch } });

  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Series column (one polygon per unique value)"
          data-test="Radar.Mapping.series"
          allowClear
          showSearch
          placeholder="e.g. supplier_name"
          defaultValue={mapping.series}
          onChange={(value: any) => updateMapping({ series: value || null })}>
          {colNames.map((c: string) => (
            // @ts-expect-error Select.Option typing
            <Select.Option key={c} value={c} data-test={`Radar.Mapping.series.${c}`}>{c}</Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Axis columns (wide-format — one axis per numeric column, pick at least 3)"
          data-test="Radar.Mapping.axes"
          mode="multiple"
          allowClear
          showSearch
          placeholder="e.g. otif_pct, quality_pct, price_score, delivery_score"
          defaultValue={Array.isArray(mapping.axes) ? mapping.axes : []}
          onChange={(value: any) => updateMapping({ axes: Array.isArray(value) ? value : [] })}>
          {colNames.map((c: string) => (
            // @ts-expect-error Select.Option typing
            <Select.Option key={c} value={c} data-test={`Radar.Mapping.axes.${c}`}>{c}</Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
          — or — long-format input (one row per series × dimension):
        </div>
        <Select
          label="Dimension column (axis labels)"
          data-test="Radar.Mapping.dimension"
          allowClear
          showSearch
          placeholder="e.g. dimension_name"
          defaultValue={mapping.dimension}
          onChange={(value: any) => updateMapping({ dimension: value || null })}>
          {colNames.map((c: string) => (
            // @ts-expect-error Select.Option typing
            <Select.Option key={c} value={c} data-test={`Radar.Mapping.dimension.${c}`}>{c}</Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Value column (numeric — score per dimension)"
          data-test="Radar.Mapping.value"
          allowClear
          showSearch
          placeholder="e.g. score"
          defaultValue={mapping.value}
          onChange={(value: any) => updateMapping({ value: value || null })}>
          {colNames.map((c: string) => (
            // @ts-expect-error Select.Option typing
            <Select.Option key={c} value={c} data-test={`Radar.Mapping.value.${c}`}>{c}</Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Axis scale"
          data-test="Radar.Scale"
          defaultValue={options.scale || "0-100"}
          onChange={(value: any) => onOptionsChange({ scale: value })}>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="0-100" data-test="Radar.Scale.0-100">0–100 (percentage scores)</Select.Option>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="auto" data-test="Radar.Scale.auto">Auto (per-axis min/max)</Select.Option>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="shared" data-test="Radar.Scale.shared">Shared (single min/max across axes)</Select.Option>
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Grid shape"
          data-test="Radar.Shape"
          defaultValue={options.shape || "polygon"}
          onChange={(value: any) => onOptionsChange({ shape: value })}>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="polygon" data-test="Radar.Shape.polygon">Polygon (straight edges)</Select.Option>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="circle" data-test="Radar.Shape.circle">Circle (rounded)</Select.Option>
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Fill opacity (0–1, 0 = outline only)"
          data-test="Radar.FillOpacity"
          min={0}
          max={1}
          step={0.05}
          defaultValue={typeof options.fillOpacity === "number" ? options.fillOpacity : 0.25}
          onChange={(value: any) =>
            onOptionsChange({ fillOpacity: Math.max(0, Math.min(1, Number(value) || 0)) })
          }
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Line width (px)"
          data-test="Radar.LineWidth"
          min={0}
          max={10}
          step={0.5}
          defaultValue={typeof options.lineWidth === "number" ? options.lineWidth : 2}
          onChange={(value: any) => onOptionsChange({ lineWidth: Number(value) || 0 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Radar.ShowSymbol"
          defaultChecked={options.showSymbol !== false}
          onChange={(event: any) => onOptionsChange({ showSymbol: event.target.checked })}>
          Show marker dots at axis intersections
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Radar.ShowAxisLabels"
          defaultChecked={options.showAxisLabels !== false}
          onChange={(event: any) => onOptionsChange({ showAxisLabels: event.target.checked })}>
          Show axis labels (indicator names)
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Radar.ShowAxisTicks"
          defaultChecked={!!options.showAxisTicks}
          onChange={(event: any) => onOptionsChange({ showAxisTicks: event.target.checked })}>
          Show axis tick numbers (e.g. 25, 50, 75, 100)
        </Checkbox>
      </Section>
    </React.Fragment>
  );
}

export default createTabbedEditor([
  { key: "General", title: "General", component: GeneralSettings },
  { key: "Radar", title: "Radar", component: RadarSettings },
  { key: "Series", title: "Series", component: SeriesSettings },
  { key: "Colors", title: "Colors", component: ColorsSettings },
  { key: "DataLabels", title: "Data Labels", component: DataLabelsSettings },
]);
