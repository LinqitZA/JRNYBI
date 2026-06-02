/**
 * Data bar cell column (feature #208)
 *
 * Renders a numeric value with a thin horizontal "magnitude bar" behind it,
 * scaled to the column's min..max range. Think Excel's conditional-formatting
 * data bars — a fast way to spot which rows have the biggest / smallest
 * numbers without reading the formatted number string.
 *
 * Behaviour:
 *   - For all-positive columns the bar grows from the left edge.
 *   - For all-negative columns the bar grows from the right edge in the
 *     negative color.
 *   - For mixed columns (some negative) the axis sits at 0 in the middle;
 *     positive values stretch right, negatives stretch left, each using a
 *     different semantic color from the JRNY palette.
 *
 * Editor controls (Table.ColumnEditor.DataBar.*):
 *   - Color (positive bar):  primary | positive | negative | warning | neutral | info | custom hex
 *   - Color (negative bar):  same palette (only shown when column has negatives)
 *   - Show value text:       yes/no — when off, the cell is just the bar
 *   - Bar height (px)
 *
 * The component reads column.__dataMin / column.__dataMax which the Table
 * Renderer injects per render. When those are absent (e.g. used outside the
 * table renderer) the component degrades gracefully to "render value, no bar".
 */
import React from "react";
import {
  Section,
  Select,
  Switch,
  InputNumber,
  Input,
} from "@/components/visualizations/editor";
import { createNumberFormatter } from "@/lib/value-format";

const PALETTE: Record<string, string> = {
  primary: "var(--jrny-primary-bg, rgba(37, 99, 235, 0.18))",
  positive: "var(--jrny-positive-bg, rgba(17, 122, 59, 0.20))",
  negative: "var(--jrny-negative-bg, rgba(180, 35, 24, 0.20))",
  warning: "var(--jrny-warning-bg, rgba(181, 71, 8, 0.20))",
  neutral: "var(--jrny-neutral-bg, rgba(71, 85, 105, 0.18))",
  info: "var(--jrny-info-bg, rgba(29, 78, 216, 0.18))",
};

const COLOR_OPTIONS = [
  { value: "primary", label: "Primary (JRNY Blue)" },
  { value: "positive", label: "Positive (green)" },
  { value: "negative", label: "Negative (red)" },
  { value: "warning", label: "Warning (amber)" },
  { value: "neutral", label: "Neutral (slate)" },
  { value: "info", label: "Info (blue)" },
  { value: "custom", label: "Custom color…" },
];

function resolveBarColor(setting: string | undefined, customColor: string | undefined, fallback: string): string {
  if (!setting || setting === "custom") {
    const c = (customColor || "").trim();
    return c !== "" ? c : PALETTE[fallback] || PALETTE.primary;
  }
  return PALETTE[setting] || PALETTE.primary;
}

type EditorProps = {
  column: {
    name: string;
    dataBarColor?: string;
    dataBarNegativeColor?: string;
    dataBarCustomColor?: string;
    dataBarCustomNegativeColor?: string;
    dataBarShowValue?: boolean;
    dataBarHeight?: number;
    numberFormat?: string;
  };
  onChange: (changes: any) => any;
};

function Editor({ column, onChange }: EditorProps) {
  const SelectAny = Select as any;
  const SwitchAny = Switch as any;
  const InputNumberAny = InputNumber as any;
  const InputAny = Input as any;
  const color = column.dataBarColor || "positive";
  const negColor = column.dataBarNegativeColor || "negative";
  const isCustom = color === "custom";
  const isNegCustom = negColor === "custom";

  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <SelectAny
          layout="horizontal"
          label="Positive bar color"
          data-test="Table.ColumnEditor.DataBar.Color"
          defaultValue={color}
          onChange={(dataBarColor: any) => onChange({ dataBarColor })}>
          {COLOR_OPTIONS.map(c => (
            <SelectAny.Option
              key={c.value}
              value={c.value}
              data-test={`Table.ColumnEditor.DataBar.Color.${c.value}`}>
              {c.label}
            </SelectAny.Option>
          ))}
        </SelectAny>
      </Section>

      {isCustom && (
        // @ts-expect-error Section children typing
        <Section>
          <InputAny
            label="Custom positive color (CSS / hex)"
            placeholder="#16a34a"
            data-test="Table.ColumnEditor.DataBar.CustomColor"
            defaultValue={column.dataBarCustomColor || ""}
            onChange={(event: any) => onChange({ dataBarCustomColor: event.target.value })}
          />
        </Section>
      )}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <SelectAny
          layout="horizontal"
          label="Negative bar color"
          data-test="Table.ColumnEditor.DataBar.NegativeColor"
          defaultValue={negColor}
          onChange={(dataBarNegativeColor: any) => onChange({ dataBarNegativeColor })}>
          {COLOR_OPTIONS.map(c => (
            <SelectAny.Option
              key={c.value}
              value={c.value}
              data-test={`Table.ColumnEditor.DataBar.NegativeColor.${c.value}`}>
              {c.label}
            </SelectAny.Option>
          ))}
        </SelectAny>
      </Section>

      {isNegCustom && (
        // @ts-expect-error Section children typing
        <Section>
          <InputAny
            label="Custom negative color (CSS / hex)"
            placeholder="#dc2626"
            data-test="Table.ColumnEditor.DataBar.CustomNegativeColor"
            defaultValue={column.dataBarCustomNegativeColor || ""}
            onChange={(event: any) => onChange({ dataBarCustomNegativeColor: event.target.value })}
          />
        </Section>
      )}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <SwitchAny
          data-test="Table.ColumnEditor.DataBar.ShowValue"
          defaultChecked={column.dataBarShowValue !== false}
          onChange={(dataBarShowValue: any) => onChange({ dataBarShowValue })}>
          Show value text
        </SwitchAny>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputNumberAny
          layout="horizontal"
          label="Bar height (px)"
          data-test="Table.ColumnEditor.DataBar.Height"
          defaultValue={column.dataBarHeight || 18}
          min={4}
          max={48}
          onChange={(dataBarHeight: any) => onChange({ dataBarHeight })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <InputAny
          label="Number format (numeraljs)"
          placeholder="0,0.00"
          data-test="Table.ColumnEditor.DataBar.Format"
          defaultValue={column.numberFormat || ""}
          onChange={(event: any) => onChange({ numberFormat: event.target.value })}
        />
      </Section>
    </React.Fragment>
  );
}

// ---------------------------------------------------------------------------
// Bar geometry
// ---------------------------------------------------------------------------

export interface DataBarGeometry {
  /** Whether to render the bar at all (false when value is non-numeric). */
  show: boolean;
  /** Whether the value is negative. */
  isNegative: boolean;
  /** Left edge of the bar as a percent of the cell width (0-100). */
  leftPct: number;
  /** Bar width as a percent of the cell width (0-100). */
  widthPct: number;
  /** Whether the axis sits at 0 in the middle (mixed-sign column). */
  hasNegativeAxis: boolean;
}

/**
 * Pure geometry helper — exposed for unit testing the bar math.
 *
 * Algorithm:
 *   - All-positive column (min >= 0):   bar starts at 0 (left edge), width = v/max
 *   - All-negative column (max <= 0):   bar starts at right edge, grows left = |v/min|
 *   - Mixed-sign column:                axis at midpoint mapped to 0,
 *                                       positive grows right of axis, negative left.
 */
export function dataBarGeometry(value: number, min: number, max: number): DataBarGeometry {
  if (!isFinite(value)) return { show: false, isNegative: false, leftPct: 0, widthPct: 0, hasNegativeAxis: false };

  if (min >= 0) {
    // All-positive column. Use 0 as the axis so a 0 value renders no bar.
    const denom = max <= 0 ? 1 : max;
    const w = Math.min(100, Math.max(0, (value / denom) * 100));
    return { show: true, isNegative: false, leftPct: 0, widthPct: w, hasNegativeAxis: false };
  }
  if (max <= 0) {
    // All-negative column. Axis on the right; bar grows leftward.
    const denom = min >= 0 ? 1 : Math.abs(min);
    const w = Math.min(100, Math.max(0, (Math.abs(value) / denom) * 100));
    return { show: true, isNegative: true, leftPct: 100 - w, widthPct: w, hasNegativeAxis: false };
  }
  // Mixed-sign. Axis sits at midpoint (50%).
  if (value >= 0) {
    const w = Math.min(50, (value / max) * 50);
    return { show: true, isNegative: false, leftPct: 50, widthPct: w, hasNegativeAxis: true };
  }
  const w = Math.min(50, (Math.abs(value) / Math.abs(min)) * 50);
  return { show: true, isNegative: true, leftPct: 50 - w, widthPct: w, hasNegativeAxis: true };
}

// ---------------------------------------------------------------------------
// Cell component factory
// ---------------------------------------------------------------------------

export default function initDataBarColumn(column: any) {
  const format = createNumberFormatter(column.numberFormat, true);

  function prepareData(row: any) {
    const raw = row[column.name];
    const value = typeof raw === "number" ? raw : parseFloat(raw);
    return {
      text: format(raw),
      value: isFinite(value) ? value : null,
    };
  }

  function DataBarColumn({ row }: any) {
    const { text, value } = prepareData(row);
    const min = Number.isFinite(column.__dataMin) ? column.__dataMin : 0;
    const max = Number.isFinite(column.__dataMax) ? column.__dataMax : 0;
    const showValue = column.dataBarShowValue !== false;
    const height = Number.isFinite(column.dataBarHeight) ? column.dataBarHeight : 18;

    if (value === null) {
      return <span className="data-bar-cell-empty">{text || ""}</span>;
    }

    const geom = dataBarGeometry(value, min, max);
    const positiveColor = resolveBarColor(column.dataBarColor || "positive", column.dataBarCustomColor, "positive");
    const negativeColor = resolveBarColor(column.dataBarNegativeColor || "negative", column.dataBarCustomNegativeColor, "negative");
    const barColor = geom.isNegative ? negativeColor : positiveColor;

    return (
      <span
        className={`data-bar-cell ${geom.hasNegativeAxis ? "data-bar-cell-mixed" : ""}`}
        style={{ display: "inline-block", position: "relative", width: "100%", verticalAlign: "middle" }}>
        {geom.show && (
          <span
            className="data-bar-cell-bar"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${geom.leftPct}%`,
              top: `calc(50% - ${height / 2}px)`,
              width: `${geom.widthPct}%`,
              height: `${height}px`,
              backgroundColor: barColor,
              borderRadius: 2,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        )}
        {geom.hasNegativeAxis && (
          <span
            className="data-bar-cell-axis"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: `calc(50% - ${height / 2}px)`,
              width: "1px",
              height: `${height}px`,
              backgroundColor: "var(--jrny-text-3, #94a3b8)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}
        {showValue ? (
          <span className="data-bar-cell-value" style={{ position: "relative", zIndex: 2, paddingLeft: 4, paddingRight: 4 }}>
            {text}
          </span>
        ) : (
          // Even when hidden, keep an SR-only label so screen readers still
          // announce the magnitude.
          <span style={{ position: "absolute", left: -10000, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
            {text}
          </span>
        )}
      </span>
    );
  }

  DataBarColumn.prepareData = prepareData;

  return DataBarColumn;
}

initDataBarColumn.friendlyName = "Data bar";
initDataBarColumn.Editor = Editor;
