/**
 * KPI Card v2 — Comparison tab (feature #192)
 *
 * Choose how to compute the delta chip shown next to the headline number.
 *
 * Modes:
 *   none             — no chip
 *   previous-period  — value at len-2 in the sparkline series
 *   prior-year       — value 12 steps back in the sparkline series
 *   custom-value     — literal user-entered comparison value
 *   target-column    — pulls from the legacy target column / row number
 *                       (kept so existing dashboards keep their target)
 */
import { map } from "lodash";
import React from "react";
import { Section, Select, Input, InputNumber } from "@/components/visualizations/editor";
import { EditorPropTypes } from "@/visualizations/prop-types";

import { defaultComparisonLabel } from "../utils";

const MODES: Array<{ value: string; label: string }> = [
  { value: "none", label: "No comparison" },
  { value: "previous-period", label: "Previous period" },
  { value: "prior-year", label: "Prior year (12 steps back)" },
  { value: "custom-value", label: "Custom value" },
  { value: "target-column", label: "Target column (legacy)" },
];

export default function ComparisonSettings({ options, data, onOptionsChange }: any) {
  const mode = options.comparisonMode || "none";
  return (
    <React.Fragment>
      {/* @ts-expect-error */}
      <Section>
        <Select
          layout="horizontal"
          label="Comparison Mode"
          data-test="Counter.Comparison.Mode"
          defaultValue={mode}
          onChange={(comparisonMode: any) =>
            onOptionsChange({
              comparisonMode,
              comparisonLabel: options.comparisonLabel || defaultComparisonLabel(comparisonMode),
            })
          }>
          {map(MODES, (m) => (
            // @ts-expect-error
            <Select.Option key={m.value} value={m.value} data-test={"Counter.Comparison.Mode." + m.value}>
              {m.label}
              {/* @ts-expect-error */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {mode === "custom-value" && (
        // @ts-expect-error
        <Section>
          <InputNumber
            layout="horizontal"
            label="Custom Comparison Value"
            data-test="Counter.Comparison.CustomValue"
            defaultValue={options.comparisonValue}
            onChange={(comparisonValue: any) => onOptionsChange({ comparisonValue })}
          />
        </Section>
      )}

      {mode === "target-column" && (
        <React.Fragment>
          {/* @ts-expect-error */}
          <Section>
            <Select
              layout="horizontal"
              label="Target Value Column"
              data-test="Counter.Comparison.TargetColumn"
              defaultValue={options.targetColName}
              onChange={(targetColName: any) => onOptionsChange({ targetColName })}>
              {/* @ts-expect-error */}
              <Select.Option value="">No target value</Select.Option>
              {map(data.columns, (col: any) => (
                // @ts-expect-error
                <Select.Option key={col.name} data-test={"Counter.Comparison.TargetColumn." + col.name}>
                  {col.name}
                  {/* @ts-expect-error */}
                </Select.Option>
              ))}
            </Select>
          </Section>

          {/* @ts-expect-error */}
          <Section>
            <InputNumber
              layout="horizontal"
              label="Target Value Row Number"
              data-test="Counter.Comparison.TargetRow"
              defaultValue={options.targetRowNumber}
              onChange={(targetRowNumber: any) => onOptionsChange({ targetRowNumber })}
            />
          </Section>
        </React.Fragment>
      )}

      {mode !== "none" && (
        // @ts-expect-error
        <Section>
          <Input
            layout="horizontal"
            label="Comparison Label"
            data-test="Counter.Comparison.Label"
            defaultValue={options.comparisonLabel}
            placeholder={defaultComparisonLabel(mode)}
            onChange={(e: any) => onOptionsChange({ comparisonLabel: e.target.value })}
          />
        </Section>
      )}
    </React.Fragment>
  );
}

ComparisonSettings.propTypes = EditorPropTypes;
