/* eslint-disable react/prop-types */
// Feature #195: Gantt chart type (ECharts custom series)
//
// Custom Editor — composes the shared ECharts tabs (General / Series /
// Colors / Data Labels) with a Gantt-specific "Gantt" tab that exposes
// column mapping (task / start / end / optional status / optional
// progress) plus the Gantt-specific knobs (today line, sort order, bar
// height, tooltip template, per-status colour overrides).

import React from "react";
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";
import { Section, Select as RawSelect, Checkbox, Input, InputNumber } from "@/components/visualizations/editor";

const Select: any = RawSelect;

import GeneralSettings from "../echarts/Editor/GeneralSettings";
import SeriesSettings from "../echarts/Editor/SeriesSettings";
import ColorsSettings from "../echarts/Editor/ColorsSettings";
import DataLabelsSettings from "../echarts/Editor/DataLabelsSettings";

const SORT_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "start", label: "Start date (earliest first)" },
  { key: "end", label: "End date (earliest first)" },
  { key: "task", label: "Task name (A-Z)" },
  { key: "duration", label: "Duration (longest first)" },
  { key: "asAdded", label: "Query order (as added)" },
];

function GanttSettings({ options, data, onOptionsChange }: any) {
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);
  const mapping = options.columnMapping || {};

  // Auto-detect placeholders so the editor hints at the expected schema.
  const taskPlaceholder =
    colNames.find((n: string) => /task|name|category|project|order|po/i.test(n)) ||
    colNames[0] ||
    "task";
  const startPlaceholder =
    colNames.find((n: string) => /start|begin|from/i.test(n)) || colNames[1] || "start_date";
  const endPlaceholder =
    colNames.find((n: string) => /end|finish|to|due/i.test(n)) || colNames[2] || "end_date";

  // Collect the distinct status values from the current dataset so the
  // user can colour-map each one individually. We use the configured
  // status column with a sensible fallback when nothing is mapped yet.
  const statusColumn = mapping.status || options.statusColumn || null;
  const statusValues: string[] = (() => {
    if (!statusColumn) return [];
    const rows: any[] = (data && data.rows) || [];
    const set = new Set<string>();
    for (const r of rows) {
      const v = r[statusColumn];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    }
    return Array.from(set).sort();
  })();

  const statusColors: Record<string, string> =
    options.statusColors && typeof options.statusColors === "object" ? options.statusColors : {};

  const renderColumnSelect = (
    label: string,
    key: string,
    placeholder: string,
    extra?: Record<string, any>
  ) => (
    // @ts-expect-error Section children typing
    <Section>
      <Select
        label={label}
        data-test={`Gantt.Mapping.${key}`}
        allowClear
        showSearch
        placeholder={placeholder}
        defaultValue={mapping[key]}
        onChange={(value: any) =>
          onOptionsChange({ columnMapping: { ...mapping, [key]: value || null } })
        }
        {...(extra || {})}>
        {colNames.map((c: string) => (
          <Select.Option key={c} value={c} data-test={`Gantt.Mapping.${key}.${c}`}>
            {c}
          </Select.Option>
        ))}
      </Select>
    </Section>
  );

  return (
    <React.Fragment>
      {renderColumnSelect("Task / category column (required)", "task", taskPlaceholder)}
      {renderColumnSelect("Start date column (required)", "start", startPlaceholder)}
      {renderColumnSelect("End date column (required)", "end", endPlaceholder)}
      {renderColumnSelect("Status column (optional)", "status", "e.g. status, phase")}
      {renderColumnSelect("Progress column (optional, 0-1 or 0-100)", "progress", "e.g. completion_pct")}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Sort order"
          data-test="Gantt.SortOrder"
          defaultValue={options.sortOrder || "start"}
          onChange={(value: any) => onOptionsChange({ sortOrder: value })}>
          {SORT_OPTIONS.map((opt) => (
            <Select.Option key={opt.key} value={opt.key} data-test={`Gantt.SortOrder.${opt.key}`}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Gantt.ShowTodayLine"
          defaultChecked={options.showTodayLine !== false}
          onChange={(event: any) => onOptionsChange({ showTodayLine: event.target.checked })}>
          Show "today" line
        </Checkbox>
      </Section>

      {options.showTodayLine !== false && (
        // @ts-expect-error Section children typing
        <Section>
          <Input
            label="Today date override (YYYY-MM-DD, blank = real now)"
            data-test="Gantt.TodayDate"
            placeholder="2026-06-01"
            defaultValue={options.todayDate || ""}
            onChange={(event: any) =>
              onOptionsChange({ todayDate: event.target.value || null })
            }
          />
        </Section>
      )}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="Gantt.ShowProgressBar"
          defaultChecked={options.showProgressBar !== false}
          onChange={(event: any) => onOptionsChange({ showProgressBar: event.target.checked })}>
          Overlay progress bar inside task rectangles
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Bar height (px)"
          data-test="Gantt.BarHeight"
          min={6}
          max={48}
          defaultValue={typeof options.barHeight === "number" ? options.barHeight : 18}
          onChange={(value: any) => onOptionsChange({ barHeight: Number(value) || 18 })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Tooltip template (use {task}, {start}, {end}, {status}, {progress}, {duration})"
          data-test="Gantt.TooltipFormat"
          placeholder="{task} · {start} → {end} · {duration}d"
          defaultValue={options.tooltipFormat || ""}
          onChange={(event: any) =>
            onOptionsChange({ tooltipFormat: event.target.value || "" })
          }
        />
      </Section>

      {/* -----------------------------------------------------------------
          Per-status colour overrides. Surfaced as one Input per distinct
          status value found in the current dataset; users can leave them
          blank to fall back to the categorical palette cycle.
        ----------------------------------------------------------------- */}
      {statusValues.length > 0 && (
        // @ts-expect-error Section children typing
        <Section>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>
            Per-status colour overrides (leave blank for auto)
          </div>
          {statusValues.map((sv) => (
            <Input
              key={sv}
              label={sv}
              data-test={`Gantt.StatusColor.${sv}`}
              placeholder="#4e79a7"
              defaultValue={statusColors[sv] || ""}
              onChange={(event: any) => {
                const next = { ...statusColors };
                const v = event.target.value && event.target.value.trim();
                if (v) next[sv] = v;
                else delete next[sv];
                onOptionsChange({ statusColors: next });
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
  { key: "Gantt", title: "Gantt", component: GanttSettings },
  { key: "Series", title: "Series", component: SeriesSettings },
  { key: "Colors", title: "Colors", component: ColorsSettings },
  { key: "DataLabels", title: "Data Labels", component: DataLabelsSettings },
]);
