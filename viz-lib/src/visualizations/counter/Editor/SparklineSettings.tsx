/**
 * KPI Card v2 — Sparkline tab (feature #192)
 *
 * Configures the mini trend strip rendered under the headline number.
 */
import { map } from "lodash";
import React from "react";
import { Section, Select, Switch } from "@/components/visualizations/editor";
import { EditorPropTypes } from "@/visualizations/prop-types";

const VARIANTS = [
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
  { value: "spots", label: "Line + spots" },
];

const COLOR_TOKENS = [
  { value: "auto", label: "Auto (follow delta direction)" },
  { value: "primary", label: "Primary (JRNY Blue)" },
  { value: "positive", label: "Positive (green)" },
  { value: "negative", label: "Negative (red)" },
  { value: "warning", label: "Warning (amber)" },
  { value: "neutral", label: "Neutral (slate)" },
  { value: "info", label: "Info (blue)" },
];

export default function SparklineSettings({ options, data, onOptionsChange }: any) {
  const enabled = !!options.showSparkline;
  return (
    <React.Fragment>
      {/* @ts-expect-error */}
      <Section>
        {/* @ts-expect-error */}
        <Switch
          data-test="Counter.Sparkline.Show"
          // @ts-expect-error
          defaultChecked={enabled}
          // @ts-expect-error
          onChange={(showSparkline: any) => onOptionsChange({ showSparkline })}>
          Show Sparkline (mini trend strip)
        </Switch>
      </Section>

      {/* @ts-expect-error */}
      <Section>
        <Select
          layout="horizontal"
          label="Sparkline Value Column"
          data-test="Counter.Sparkline.ValueColumn"
          defaultValue={options.sparklineColumn}
          disabled={!enabled}
          onChange={(sparklineColumn: any) => onOptionsChange({ sparklineColumn })}>
          {/* @ts-expect-error */}
          <Select.Option value="">(Use Value Column)</Select.Option>
          {map(data.columns, (col: any) => (
            // @ts-expect-error
            <Select.Option key={col.name} data-test={"Counter.Sparkline.ValueColumn." + col.name}>
              {col.name}
              {/* @ts-expect-error */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error */}
      <Section>
        <Select
          layout="horizontal"
          label="Sparkline Order Column (optional)"
          data-test="Counter.Sparkline.DateColumn"
          defaultValue={options.sparklineDateColumn}
          disabled={!enabled}
          onChange={(sparklineDateColumn: any) => onOptionsChange({ sparklineDateColumn })}>
          {/* @ts-expect-error */}
          <Select.Option value="">(Use row order)</Select.Option>
          {map(data.columns, (col: any) => (
            // @ts-expect-error
            <Select.Option key={col.name} data-test={"Counter.Sparkline.DateColumn." + col.name}>
              {col.name}
              {/* @ts-expect-error */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error */}
      <Section>
        <Select
          layout="horizontal"
          label="Sparkline Style"
          data-test="Counter.Sparkline.Variant"
          defaultValue={options.sparklineVariant || "line"}
          disabled={!enabled}
          onChange={(sparklineVariant: any) => onOptionsChange({ sparklineVariant })}>
          {map(VARIANTS, (v) => (
            // @ts-expect-error
            <Select.Option key={v.value} value={v.value}>
              {v.label}
              {/* @ts-expect-error */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error */}
      <Section>
        <Select
          layout="horizontal"
          label="Sparkline Color"
          data-test="Counter.Sparkline.Color"
          defaultValue={options.sparklineColor || "auto"}
          disabled={!enabled}
          onChange={(sparklineColor: any) => onOptionsChange({ sparklineColor })}>
          {map(COLOR_TOKENS, (c) => (
            // @ts-expect-error
            <Select.Option key={c.value} value={c.value}>
              {c.label}
              {/* @ts-expect-error */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error */}
      <Section>
        {/* @ts-expect-error */}
        <Switch
          data-test="Counter.Sparkline.Narrative"
          // @ts-expect-error
          defaultChecked={!!options.showNarrative}
          // @ts-expect-error
          onChange={(showNarrative: any) => onOptionsChange({ showNarrative })}>
          Show Narrative Summary (1-2 sentence auto-description)
        </Switch>
      </Section>
    </React.Fragment>
  );
}

SparklineSettings.propTypes = EditorPropTypes;
