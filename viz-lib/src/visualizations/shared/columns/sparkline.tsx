/**
 * Sparkline cell column (feature #206)
 *
 * Renders a tiny in-cell sparkline chart per row using the shared
 * `Sparkline` wrapper around `react-sparklines` (already a dependency
 * for the Counter v2 viz — see feature #192).
 *
 * Accepted input formats per row (column.name):
 *   - JSON array string:   "[1, 2, 3, 4]"
 *   - JS-style array:      [1, 2, 3, 4]
 *   - Comma-separated:     "1, 2, 3, 4"
 *   - Whitespace-separated:"1 2 3 4"
 *   - Postgres array text: "{1,2,3,4}"
 *   - null / undefined / empty → renders nothing (cell stays empty)
 *
 * Editor controls (Table.ColumnEditor.Sparkline.*):
 *   - Chart type:        line | bar | area
 *   - Color:             auto | primary | positive | negative | warning |
 *                         neutral | info | custom hex
 *   - Show last-point marker (only meaningful for line / area)
 *   - Width / Height (pixels)
 *
 * The "auto" color resolves to "positive" when the series ends above where
 * it started (last >= first), "negative" otherwise — same semantic palette
 * as the Counter v2 delta chip.
 */
import React from "react";
import {
  Section,
  Select,
  Switch,
  InputNumber,
  Input,
} from "@/components/visualizations/editor";

import Sparkline, { SparklineColorToken, SparklineVariant } from "@/components/Sparkline";

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Convert a raw cell value into a flat array of numbers. Returns [] when no
 * usable numeric values could be extracted, so the consumer can decide what
 * to render (we render nothing for an empty series).
 */
export function parseSparklineValues(raw: any): number[] {
  if (raw == null) return [];

  // Native array / typed array — keep finite numbers only.
  if (Array.isArray(raw)) {
    return raw
      .map((v: any) => (typeof v === "number" ? v : parseFloat(v)))
      .filter((n: number) => typeof n === "number" && isFinite(n));
  }

  // Single number — degenerate series of length 1 (Sparkline still renders).
  if (typeof raw === "number" && isFinite(raw)) {
    return [raw];
  }

  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "NULL") return [];

  // Try JSON parse first (handles "[1,2,3]" plus "{\"...\":..}" objects we
  // still want to skip).
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v: any) => (typeof v === "number" ? v : parseFloat(v)))
          .filter((n: number) => typeof n === "number" && isFinite(n));
      }
    } catch (_e) {
      // fall through to delimiter parsing — input might be "[1, 2, 3]"
      // without strict JSON formatting (e.g. trailing comma).
    }
  }

  // Postgres array literal: "{1,2,3}" or "{1,2,3,NULL}".
  let body = trimmed;
  if (body.startsWith("{") && body.endsWith("}")) {
    body = body.slice(1, -1);
  } else if (body.startsWith("[") && body.endsWith("]")) {
    body = body.slice(1, -1);
  }

  // Split on common delimiters (comma / semicolon / whitespace). This makes
  // "1, 2, 3", "1;2;3" and "1 2 3" all work, and tolerates the JSON-ish
  // shape we may have fallen through to above.
  const parts = body.split(/[,;\s]+/).filter((p: string) => p.length > 0);
  const nums = parts
    .map((p: string) => parseFloat(p))
    .filter((n: number) => typeof n === "number" && isFinite(n));

  return nums;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const VARIANTS = [
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
  { value: "area", label: "Area (line + fill)" },
];

const COLOR_OPTIONS = [
  { value: "auto", label: "Auto (positive ↑ / negative ↓)" },
  { value: "primary", label: "Primary (JRNY Blue)" },
  { value: "positive", label: "Positive (green)" },
  { value: "negative", label: "Negative (red)" },
  { value: "warning", label: "Warning (amber)" },
  { value: "neutral", label: "Neutral (slate)" },
  { value: "info", label: "Info (blue)" },
  { value: "custom", label: "Custom color…" },
];

type EditorProps = {
  column: {
    name: string;
    sparklineVariant?: string;
    sparklineColor?: string;
    sparklineCustomColor?: string;
    sparklineShowLast?: boolean;
    sparklineWidth?: number;
    sparklineHeight?: number;
  };
  onChange: (changes: any) => any;
};

function Editor({ column, onChange }: EditorProps) {
  const variant = column.sparklineVariant || "line";
  const color = column.sparklineColor || "auto";
  const isCustomColor = color === "custom";
  const isBar = variant === "bar";

  const SelectAny = Select as any;
  const SwitchAny = Switch as any;
  const InputNumberAny = InputNumber as any;
  const InputAny = Input as any;

  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <SelectAny
          layout="horizontal"
          label="Chart type"
          data-test="Table.ColumnEditor.Sparkline.Variant"
          defaultValue={variant}
          onChange={(sparklineVariant: any) => onChange({ sparklineVariant })}>
          {VARIANTS.map(v => (
            <SelectAny.Option
              key={v.value}
              value={v.value}
              data-test={`Table.ColumnEditor.Sparkline.Variant.${v.value}`}>
              {v.label}
            </SelectAny.Option>
          ))}
        </SelectAny>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <SelectAny
          layout="horizontal"
          label="Color"
          data-test="Table.ColumnEditor.Sparkline.Color"
          defaultValue={color}
          onChange={(sparklineColor: any) => onChange({ sparklineColor })}>
          {COLOR_OPTIONS.map(c => (
            <SelectAny.Option
              key={c.value}
              value={c.value}
              data-test={`Table.ColumnEditor.Sparkline.Color.${c.value}`}>
              {c.label}
            </SelectAny.Option>
          ))}
        </SelectAny>
      </Section>

      {isCustomColor && (
        // @ts-expect-error Section children typing
        <Section>
          <InputAny
            label="Custom color (CSS / hex)"
            placeholder="#2563eb"
            data-test="Table.ColumnEditor.Sparkline.CustomColor"
            defaultValue={column.sparklineCustomColor || ""}
            onChange={(event: any) =>
              onChange({ sparklineCustomColor: event.target.value })
            }
          />
        </Section>
      )}

      {!isBar && (
        // @ts-expect-error Section children typing
        <Section>
          <SwitchAny
            data-test="Table.ColumnEditor.Sparkline.ShowLast"
            defaultChecked={!!column.sparklineShowLast}
            onChange={(sparklineShowLast: any) =>
              onChange({ sparklineShowLast })
            }>
            Show last-point marker
          </SwitchAny>
        </Section>
      )}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumberAny
          layout="horizontal"
          label="Width (px)"
          data-test="Table.ColumnEditor.Sparkline.Width"
          defaultValue={column.sparklineWidth || 100}
          min={20}
          max={600}
          onChange={(sparklineWidth: any) => onChange({ sparklineWidth })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumberAny
          layout="horizontal"
          label="Height (px)"
          data-test="Table.ColumnEditor.Sparkline.Height"
          defaultValue={column.sparklineHeight || 28}
          min={10}
          max={120}
          onChange={(sparklineHeight: any) => onChange({ sparklineHeight })}
        />
      </Section>
    </React.Fragment>
  );
}

// ---------------------------------------------------------------------------
// Cell renderer
// ---------------------------------------------------------------------------

/**
 * Resolve the configured color setting into a string usable by the Sparkline
 * component. "auto" falls back to positive / negative based on the last vs.
 * first datapoint. "custom" requires a non-empty `sparklineCustomColor`,
 * otherwise we fall back to "primary".
 */
export function resolveSparklineColor(
  setting: string | undefined,
  customColor: string | undefined,
  series: number[]
): string | SparklineColorToken {
  if (!setting || setting === "auto") {
    if (series.length < 2) return "primary";
    const first = series[0];
    const last = series[series.length - 1];
    return last >= first ? "positive" : "negative";
  }
  if (setting === "custom") {
    const c = (customColor || "").trim();
    return c !== "" ? c : "primary";
  }
  return setting as SparklineColorToken;
}

export default function initSparklineColumn(column: any) {
  const rawVariant = (column.sparklineVariant as string) || "line";
  // Sparkline component supports "line" | "bar" | "spots". "area" is a UI
  // affordance — same renderer as "line" with the stroke color also used as
  // fill so the area beneath is shaded.
  const variant: SparklineVariant = rawVariant === "bar" ? "bar" : "line";
  const isArea = rawVariant === "area";

  function prepareData(row: any) {
    const series = parseSparklineValues(row[column.name]);
    return {
      text: series.length > 0 ? series.join(", ") : "",
      series,
    };
  }

  function SparklineColumn({ row }: any) {
    const { series } = prepareData(row);
    if (series.length === 0) {
      return null;
    }

    const color = resolveSparklineColor(
      column.sparklineColor,
      column.sparklineCustomColor,
      series
    );

    const width = Number.isFinite(column.sparklineWidth) ? column.sparklineWidth : 100;
    const height = Number.isFinite(column.sparklineHeight) ? column.sparklineHeight : 28;

    const ariaLabel = `${column.title || column.name}: ${series.length} points, from ${series[0]} to ${series[series.length - 1]}`;

    return (
      <Sparkline
        data={series}
        variant={variant}
        color={color as any}
        fillColor={isArea ? (color as any) : undefined}
        showSpots={!!column.sparklineShowLast && variant === "line"}
        width={width}
        height={height}
        ariaLabel={ariaLabel}
        className="table-sparkline-cell"
        style={{
          display: "inline-block",
          verticalAlign: "middle",
          // Area fill looks better with a slight stroke fade.
          opacity: 1,
          // Force the underlying svg fill (set by react-sparklines) to render
          // semi-transparent when in area mode so it doesn't visually
          // dominate the cell.
          ...(isArea ? { fillOpacity: 0.22 } : null),
        } as React.CSSProperties}
      />
    );
  }

  SparklineColumn.prepareData = prepareData;

  return SparklineColumn;
}

initSparklineColumn.friendlyName = "Sparkline";
initSparklineColumn.Editor = Editor;
