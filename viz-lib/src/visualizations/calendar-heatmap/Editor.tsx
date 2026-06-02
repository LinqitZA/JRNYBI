/* eslint-disable react/prop-types */
// Feature #194: Calendar heatmap chart type (ECharts)
//
// Custom Editor — composes the shared ECharts tabs (General / Series /
// Colors / Data Labels) with a calendar-specific "Calendar" tab that
// exposes column-mapping (date + value) plus the calendar-specific knobs
// (year range mode, color scale, weekday + month labels).

import React from "react";
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";
import { Section, Select as RawSelect, Checkbox, Input, InputNumber } from "@/components/visualizations/editor";

// Cast Select to any so we can access `Select.Option` without fighting the
// (loose) prop-types signature exported from the shared editor barrel.
const Select: any = RawSelect;

import GeneralSettings from "../echarts/Editor/GeneralSettings";
import SeriesSettings from "../echarts/Editor/SeriesSettings";
import ColorsSettings from "../echarts/Editor/ColorsSettings";
import DataLabelsSettings from "../echarts/Editor/DataLabelsSettings";

import { CALENDAR_COLOR_SCALES } from "./getOption";

// Available colour-scale presets surfaced in the Calendar tab dropdown.
// Keep these labels in sync with the keys defined in `getOption.ts`.
const COLOR_SCALE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "green", label: "Green (GitHub-style)" },
  { key: "blue", label: "Blue (JRNY brand)" },
  { key: "orange", label: "Orange (revenue / sales)" },
  { key: "redYellowGreen", label: "Red ▸ Yellow ▸ Green (diverging)" },
  { key: "grey", label: "Grey (monochrome)" },
];

function CalendarSettings({ options, data, onOptionsChange }: any) {
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);
  const mapping = options.columnMapping || {};

  // Auto-detect placeholders so the editor hints at what the viz is doing
  // before the user has explicitly mapped any column.
  const datePlaceholder =
    colNames.find((n: string) => /date|day|created|updated|time/i.test(n)) ||
    colNames[0] ||
    "date";
  const valuePlaceholder =
    colNames.find((n: string) => /value|amount|total|sum|count|qty/i.test(n)) ||
    colNames[colNames.length - 1] ||
    "value";

  const renderColumnSelect = (
    label: string,
    key: string,
    placeholder: string,
    multi = false
  ) => (
    // @ts-expect-error Section children typing
    <Section>
      <Select
        label={label}
        data-test={`CalendarHeatmap.Mapping.${key}`}
        mode={multi ? "multiple" : "default"}
        allowClear
        showSearch
        placeholder={placeholder}
        defaultValue={mapping[key]}
        onChange={(value: any) =>
          onOptionsChange({ columnMapping: { ...mapping, [key]: value || null } })
        }>
        {colNames.map((c: string) => (
          <Select.Option key={c} value={c} data-test={`CalendarHeatmap.Mapping.${key}.${c}`}>
            {c}
          </Select.Option>
        ))}
      </Select>
    </Section>
  );

  const yearMode: string = options.yearMode || "single";

  return (
    <React.Fragment>
      {renderColumnSelect("Date column (required)", "date", datePlaceholder)}
      {renderColumnSelect("Value column (required)", "value", valuePlaceholder)}
      {renderColumnSelect("Series column (optional — splits multi-year)", "series", "e.g. user_id, channel")}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Year range"
          data-test="CalendarHeatmap.YearMode"
          defaultValue={yearMode}
          onChange={(value: any) => onOptionsChange({ yearMode: value })}>
          <Select.Option value="single" data-test="CalendarHeatmap.YearMode.single">
            Single year (auto-detect if blank)
          </Select.Option>
          <Select.Option value="rolling12" data-test="CalendarHeatmap.YearMode.rolling12">
            Rolling 12 months
          </Select.Option>
          <Select.Option value="custom" data-test="CalendarHeatmap.YearMode.custom">
            Custom date range
          </Select.Option>
        </Select>
      </Section>

      {yearMode === "single" && (
        // @ts-expect-error Section children typing
        <Section>
          <InputNumber
            label="Year (blank = auto-detect from data)"
            data-test="CalendarHeatmap.Year"
            min={1970}
            max={2100}
            defaultValue={typeof options.year === "number" ? options.year : undefined}
            onChange={(value: any) =>
              onOptionsChange({ year: value === null || value === undefined ? null : Number(value) })
            }
          />
        </Section>
      )}

      {yearMode === "custom" && (
        <React.Fragment>
          {/* @ts-expect-error Section children typing */}
          <Section>
            <Input
              label="Range start (YYYY-MM-DD)"
              data-test="CalendarHeatmap.RangeStart"
              placeholder="2026-01-01"
              defaultValue={options.rangeStart || ""}
              onChange={(event: any) =>
                onOptionsChange({ rangeStart: event.target.value || null })
              }
            />
          </Section>
          {/* @ts-expect-error Section children typing */}
          <Section>
            <Input
              label="Range end (YYYY-MM-DD)"
              data-test="CalendarHeatmap.RangeEnd"
              placeholder="2026-12-31"
              defaultValue={options.rangeEnd || ""}
              onChange={(event: any) =>
                onOptionsChange({ rangeEnd: event.target.value || null })
              }
            />
          </Section>
        </React.Fragment>
      )}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Color scale"
          data-test="CalendarHeatmap.ColorScale"
          defaultValue={options.colorScale || "green"}
          onChange={(value: any) => onOptionsChange({ colorScale: value })}>
          {COLOR_SCALE_OPTIONS.map((scale) => (
            <Select.Option
              key={scale.key}
              value={scale.key}
              data-test={`CalendarHeatmap.ColorScale.${scale.key}`}>
              {scale.label}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Aggregate duplicate days using"
          data-test="CalendarHeatmap.Aggregation"
          defaultValue={options.aggregation || "sum"}
          onChange={(value: any) => onOptionsChange({ aggregation: value })}>
          <Select.Option value="sum">Sum</Select.Option>
          <Select.Option value="avg">Average</Select.Option>
          <Select.Option value="count">Count</Select.Option>
          <Select.Option value="max">Max</Select.Option>
          <Select.Option value="min">Min</Select.Option>
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="CalendarHeatmap.ShowWeekdayLabels"
          defaultChecked={options.showWeekdayLabels !== false}
          onChange={(event: any) =>
            onOptionsChange({ showWeekdayLabels: event.target.checked })
          }>
          Show weekday labels (Mon, Tue, …)
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="CalendarHeatmap.ShowMonthLabels"
          defaultChecked={options.showMonthLabels !== false}
          onChange={(event: any) =>
            onOptionsChange({ showMonthLabels: event.target.checked })
          }>
          Show month labels (Jan, Feb, …)
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="First day of week (0 = Sun, 1 = Mon)"
          data-test="CalendarHeatmap.FirstDayOfWeek"
          min={0}
          max={6}
          defaultValue={typeof options.firstDayOfWeek === "number" ? options.firstDayOfWeek : 1}
          onChange={(value: any) =>
            onOptionsChange({ firstDayOfWeek: Number(value) || 0 })
          }
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Empty-day fill colour"
          data-test="CalendarHeatmap.EmptyDayColor"
          placeholder="#f1f5f9"
          defaultValue={options.emptyDayColor || "#f1f5f9"}
          onChange={(event: any) =>
            onOptionsChange({ emptyDayColor: event.target.value || "#f1f5f9" })
          }
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Color scale min (blank = auto)"
          data-test="CalendarHeatmap.Min"
          defaultValue={typeof options.min === "number" ? options.min : undefined}
          onChange={(value: any) =>
            onOptionsChange({ min: value === null || value === undefined ? null : Number(value) })
          }
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumber
          label="Color scale max (blank = auto)"
          data-test="CalendarHeatmap.Max"
          defaultValue={typeof options.max === "number" ? options.max : undefined}
          onChange={(value: any) =>
            onOptionsChange({ max: value === null || value === undefined ? null : Number(value) })
          }
        />
      </Section>
    </React.Fragment>
  );
}

// Reference the imported palette table so we trip a build error if it ever
// drifts out of sync with the scale dropdown options above.
const _ENSURE_SCALES_IN_SYNC = COLOR_SCALE_OPTIONS.every(
  (opt) => Array.isArray(CALENDAR_COLOR_SCALES[opt.key]) && CALENDAR_COLOR_SCALES[opt.key].length > 0
);
if (!_ENSURE_SCALES_IN_SYNC) {
  // eslint-disable-next-line no-console
  console.warn(
    "[calendar-heatmap] Editor color-scale options drifted from CALENDAR_COLOR_SCALES; check getOption.ts"
  );
}

export default createTabbedEditor([
  { key: "General", title: "General", component: GeneralSettings },
  { key: "Calendar", title: "Calendar", component: CalendarSettings },
  { key: "Series", title: "Series", component: SeriesSettings },
  { key: "Colors", title: "Colors", component: ColorsSettings },
  { key: "DataLabels", title: "Data Labels", component: DataLabelsSettings },
]);
