/* eslint-disable react/prop-types */
// Feature #196: Network / graph chart type (ECharts)
//
// Custom Editor — composes the shared ECharts tabs (General / Series /
// Colors / Data Labels) with a network-specific "Network" tab that
// exposes the edge column mapping plus the layout / sizing / labelling
// knobs (force vs circular, node-size range, edge-thickness range, label
// visibility threshold, colour-by-group toggle and per-group overrides).

import React from "react";
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";
import { Section, Select as RawSelect, Checkbox, Input, InputNumber } from "@/components/visualizations/editor";

const Select: any = RawSelect;

import GeneralSettings from "../echarts/Editor/GeneralSettings";
import SeriesSettings from "../echarts/Editor/SeriesSettings";
import ColorsSettings from "../echarts/Editor/ColorsSettings";
import DataLabelsSettings from "../echarts/Editor/DataLabelsSettings";

const LAYOUT_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "force", label: "Force-directed (physics simulation)" },
  { key: "circular", label: "Circular (ring around centre)" },
  { key: "none", label: "Manual (drag to position)" },
];

function NetworkSettings({ options, data, onOptionsChange }: any) {
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);
  const mapping = options.columnMapping || {};

  // Auto-detect placeholders so the editor hints at the expected schema
  // before the user has picked any explicit mapping.
  const sourcePlaceholder =
    colNames.find((n: string) => /^source$|^src$|^from$|source/i.test(n)) ||
    colNames[0] ||
    "source";
  const targetPlaceholder =
    colNames.find((n: string) => /^target$|^dst$|^to$|target/i.test(n)) ||
    colNames[1] ||
    "target";

  // Collect the distinct group values from the source+target group columns
  // so we can render per-group colour pickers below.
  const sourceGroupColumn = mapping.sourceGroup || options.sourceGroupColumn || null;
  const targetGroupColumn = mapping.targetGroup || options.targetGroupColumn || null;
  const distinctGroups: string[] = (() => {
    const rows: any[] = (data && data.rows) || [];
    if (!sourceGroupColumn && !targetGroupColumn) return [];
    const set = new Set<string>();
    for (const r of rows) {
      if (sourceGroupColumn && r[sourceGroupColumn] !== null && r[sourceGroupColumn] !== undefined && r[sourceGroupColumn] !== "") {
        set.add(String(r[sourceGroupColumn]));
      }
      if (targetGroupColumn && r[targetGroupColumn] !== null && r[targetGroupColumn] !== undefined && r[targetGroupColumn] !== "") {
        set.add(String(r[targetGroupColumn]));
      }
    }
    return Array.from(set).sort();
  })();
  const groupColors: Record<string, string> =
    options.groupColors && typeof options.groupColors === "object" ? options.groupColors : {};

  const layout: string = options.layout || "force";

  const renderColumnSelect = (label: string, key: string, placeholder: string) => (
    // @ts-expect-error Section children typing
    <Section>
      <Select
        label={label}
        data-test={`Network.Mapping.${key}`}
        allowClear
        showSearch
        placeholder={placeholder}
        defaultValue={mapping[key]}
        onChange={(value: any) =>
          onOptionsChange({ columnMapping: { ...mapping, [key]: value || null } })
        }>
        {colNames.map((c: string) => (
          <Select.Option key={c} value={c} data-test={`Network.Mapping.${key}.${c}`}>
            {c}
          </Select.Option>
        ))}
      </Select>
    </Section>
  );

  return (
    <React.Fragment>
      {renderColumnSelect("Source column (required)", "source", sourcePlaceholder)}
      {renderColumnSelect("Target column (required)", "target", targetPlaceholder)}
      {renderColumnSelect("Edge weight column (optional)", "weight", "e.g. count, amount")}
      {renderColumnSelect("Source group column (optional)", "sourceGroup", "e.g. source_type")}
      {renderColumnSelect("Target group column (optional)", "targetGroup", "e.g. target_type")}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Layout"
          data-test="Network.Layout"
          defaultValue={layout}
          onChange={(value: any) => onOptionsChange({ layout: value })}>
          {LAYOUT_OPTIONS.map((opt) => (
            <Select.Option key={opt.key} value={opt.key} data-test={`Network.Layout.${opt.key}`}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* Force-layout-only knobs — surfaced behind a conditional so the
          editor stays tidy for callers using circular / manual layouts. */}
      {layout === "force" && (
        <React.Fragment>
          {/* @ts-expect-error Section children typing */}
          <Section>
            <InputNumber
              label="Repulsion (higher = more spread)"
              data-test="Network.Repulsion"
              min={10}
              max={2000}
              defaultValue={typeof options.repulsion === "number" ? options.repulsion : 120}
              onChange={(value: any) => onOptionsChange({ repulsion: Number(value) || 120 })}
            />
          </Section>
          {/* @ts-expect-error Section children typing */}
          <Section>
            <InputNumber
              label="Gravity (pull toward centre)"
              data-test="Network.Gravity"
              min={0}
              max={1}
              step={0.01}
              defaultValue={typeof options.gravity === "number" ? options.gravity : 0.08}
              onChange={(value: any) => onOptionsChange({ gravity: Number(value) || 0 })}
            />
          </Section>
          {/* @ts-expect-error Section children typing */}
          <Section>
            <InputNumber
              label="Preferred edge length (px)"
              data-test="Network.EdgeLength"
              min={10}
              max={400}
              defaultValue={typeof options.edgeLength === "number" ? options.edgeLength : 60}
              onChange={(value: any) => onOptionsChange({ edgeLength: Number(value) || 60 })}
            />
          </Section>
        </React.Fragment>
      )}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Node size — min (px)"
          data-test="Network.NodeSizeMin"
          min={1}
          max={200}
          defaultValue={typeof options.nodeSizeMin === "number" ? options.nodeSizeMin : 12}
          onChange={(value: any) => onOptionsChange({ nodeSizeMin: Number(value) || 12 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Node size — max (px)"
          data-test="Network.NodeSizeMax"
          min={1}
          max={200}
          defaultValue={typeof options.nodeSizeMax === "number" ? options.nodeSizeMax : 48}
          onChange={(value: any) => onOptionsChange({ nodeSizeMax: Number(value) || 48 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Edge thickness — min (px)"
          data-test="Network.EdgeWidthMin"
          min={0.5}
          max={32}
          step={0.5}
          defaultValue={typeof options.edgeWidthMin === "number" ? options.edgeWidthMin : 1}
          onChange={(value: any) => onOptionsChange({ edgeWidthMin: Number(value) || 1 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Edge thickness — max (px)"
          data-test="Network.EdgeWidthMax"
          min={0.5}
          max={32}
          step={0.5}
          defaultValue={typeof options.edgeWidthMax === "number" ? options.edgeWidthMax : 6}
          onChange={(value: any) => onOptionsChange({ edgeWidthMax: Number(value) || 6 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Label visibility threshold (show label only when size ≥ this)"
          data-test="Network.LabelMinSize"
          min={0}
          defaultValue={typeof options.labelMinSize === "number" ? options.labelMinSize : 0}
          onChange={(value: any) => onOptionsChange({ labelMinSize: Number(value) || 0 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Network.ColorByGroup"
          defaultChecked={options.colorByGroup !== false}
          onChange={(event: any) => onOptionsChange({ colorByGroup: event.target.checked })}>
          Color nodes by group (uses categorical palette)
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Network.ShowArrows"
          defaultChecked={!!options.showArrows}
          onChange={(event: any) => onOptionsChange({ showArrows: event.target.checked })}>
          Show direction arrows on edges
        </Checkbox>
      </Section>

      {/* -----------------------------------------------------------------
          Per-group colour overrides — one row per distinct group value
          observed in the source/target group columns. Blank values fall
          back to the categorical palette cycle.
        ----------------------------------------------------------------- */}
      {distinctGroups.length > 0 && (
        // @ts-expect-error Section children typing
        <Section>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>
            Per-group colour overrides (leave blank for auto)
          </div>
          {distinctGroups.map((g) => (
            <Input
              key={g}
              label={g}
              data-test={`Network.GroupColor.${g}`}
              placeholder="#4e79a7"
              defaultValue={groupColors[g] || ""}
              onChange={(event: any) => {
                const next = { ...groupColors };
                const v = event.target.value && event.target.value.trim();
                if (v) next[g] = v;
                else delete next[g];
                onOptionsChange({ groupColors: next });
              }}
            />
          ))}
        </Section>
      )}
    </React.Fragment>
  );
}

export default createTabbedEditor([
  { key: "General", title: "General", component: GeneralSettings },
  { key: "Network", title: "Network", component: NetworkSettings },
  { key: "Series", title: "Series", component: SeriesSettings },
  { key: "Colors", title: "Colors", component: ColorsSettings },
  { key: "DataLabels", title: "Data Labels", component: DataLabelsSettings },
]);
