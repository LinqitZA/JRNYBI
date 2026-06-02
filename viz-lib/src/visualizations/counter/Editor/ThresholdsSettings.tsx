/**
 * KPI Card v2 — Thresholds tab (feature #192)
 *
 * Lets the user define ordered thresholds. The greatest gte that is still
 * <= the current value wins and provides:
 *   - The chip background colour (overrides delta-direction default)
 *   - An optional background tint on the whole card
 *   - An optional label shown next to the chip
 *
 * Example: temperature gauge
 *   gte: -Infinity   color: negative   label: "Critical low"
 *   gte: 10          color: warning    label: "Cold"
 *   gte: 18          color: positive   label: "Comfortable"
 *   gte: 28          color: warning    label: "Warm"
 *   gte: 35          color: negative   label: "Critical high"
 */
import { map } from "lodash";
import React from "react";
import { Section, Switch } from "@/components/visualizations/editor";
import { EditorPropTypes } from "@/visualizations/prop-types";

const COLOR_TOKENS = [
  { value: "positive", label: "Positive (green)" },
  { value: "negative", label: "Negative (red)" },
  { value: "warning", label: "Warning (amber)" },
  { value: "neutral", label: "Neutral (slate)" },
  { value: "info", label: "Info (blue)" },
];

export default function ThresholdsSettings({ options, onOptionsChange }: any) {
  const thresholds = Array.isArray(options.thresholds) ? options.thresholds : [];

  const update = (next: any[]) => onOptionsChange({ thresholds: next });

  const addRow = () => {
    const last = thresholds[thresholds.length - 1];
    const nextGte = last && Number.isFinite(Number(last.gte)) ? Number(last.gte) + 1 : 0;
    update([...thresholds, { gte: nextGte, color: "neutral", label: "" }]);
  };

  const updateRow = (idx: number, patch: any) => {
    const next = thresholds.map((t: any, i: number) => (i === idx ? { ...t, ...patch } : t));
    update(next);
  };

  const removeRow = (idx: number) => {
    update(thresholds.filter((_: any, i: number) => i !== idx));
  };

  return (
    <React.Fragment>
      <p style={{ color: "var(--jrny-text-3, #64748b)", fontSize: 12, marginBottom: 10 }}>
        Define value-based colour bands. The largest threshold whose value is
        still less than or equal to the current value wins.
      </p>

      {/* @ts-expect-error */}
      <Section>
        {/* @ts-expect-error */}
        <Switch
          data-test="Counter.Thresholds.TintBackground"
          // @ts-expect-error
          defaultChecked={options.tintBackground !== false}
          // @ts-expect-error
          onChange={(tintBackground: any) => onOptionsChange({ tintBackground })}>
          Tint card background with matching threshold colour
        </Switch>
      </Section>

      <div data-test="Counter.Thresholds.List">
        {map(thresholds, (t: any, idx: number) => (
          <div
            key={idx}
            data-test={`Counter.Thresholds.Row.${idx}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.4fr 1.6fr auto",
              gap: 8,
              marginBottom: 8,
              alignItems: "center",
            }}>
            <input
              type="number"
              data-test={`Counter.Thresholds.Gte.${idx}`}
              defaultValue={Number.isFinite(Number(t.gte)) ? Number(t.gte) : 0}
              placeholder=">="
              onBlur={(e) => updateRow(idx, { gte: Number(e.target.value) })}
              className="ant-input"
              style={{ height: 28 }}
            />
            <select
              data-test={`Counter.Thresholds.Color.${idx}`}
              defaultValue={t.color || "neutral"}
              onChange={(e) => updateRow(idx, { color: e.target.value })}
              className="ant-select-selection"
              style={{ height: 28 }}>
              {COLOR_TOKENS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              data-test={`Counter.Thresholds.Label.${idx}`}
              defaultValue={t.label || ""}
              placeholder="Optional label"
              onBlur={(e) => updateRow(idx, { label: e.target.value })}
              className="ant-input"
              style={{ height: 28 }}
            />
            <button
              type="button"
              data-test={`Counter.Thresholds.Remove.${idx}`}
              className="ant-btn ant-btn-sm"
              onClick={() => removeRow(idx)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        data-test="Counter.Thresholds.Add"
        className="ant-btn ant-btn-sm"
        onClick={addRow}
        style={{ marginTop: 8 }}>
        + Add Threshold
      </button>
    </React.Fragment>
  );
}

ThresholdsSettings.propTypes = EditorPropTypes;
