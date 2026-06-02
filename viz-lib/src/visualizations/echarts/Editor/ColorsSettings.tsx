/* eslint-disable react/prop-types */
/**
 * Shared "Colors" tab for ECharts-based visualizations.
 *
 * Toggle between the built-in JRNY palette ("light"/"dark") and a custom
 * palette of up to N colors. Concrete vizes can layer per-series color
 * overrides on top via the Series tab.
 */
import React from "react";

import { Section, Select, ColorPicker } from "@/components/visualizations/editor";
import { JRNYBI_CATEGORICAL_PALETTE } from "../themes";

export default function EChartsColorsSettings({ options, onOptionsChange }: any) {
  const palette = options.palette || JRNYBI_CATEGORICAL_PALETTE;
  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <Select
          label="Theme"
          data-test="ECharts.Theme"
          defaultValue={options.theme || "jrny-light"}
          onChange={(theme: any) => onOptionsChange({ theme })}>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="jrny-light">JRNY Light</Select.Option>
          {/* @ts-expect-error Select.Option typing */}
          <Select.Option value="jrny-dark">JRNY Dark</Select.Option>
        </Select>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {palette.slice(0, 10).map((c: string, idx: number) => (
            <ColorPicker
              key={idx}
              data-test={`ECharts.PaletteColor.${idx}`}
              color={c}
              triggerProps={{ "data-test": `ECharts.Trigger.${idx}` }}
              onChange={(newColor: string) => {
                const next = [...palette];
                next[idx] = newColor;
                onOptionsChange({ palette: next });
              }}
            />
          ))}
        </div>
      </Section>
    </React.Fragment>
  );
}
