/* eslint-disable react/prop-types */
/**
 * Shared "Data Labels" tab for ECharts-based visualizations.
 *
 * ECharts labels live inside each series option ({label: {show, formatter,
 * position}}), but at the visualization-config level we expose a small
 * top-level toggle that each viz's getOption() can spread onto its series.
 */
import React from "react";

import { Section, Checkbox, Input } from "@/components/visualizations/editor";

export default function EChartsDataLabelsSettings({ options, onOptionsChange }: any) {
  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="ECharts.ShowDataLabels"
          defaultChecked={!!options.showDataLabels}
          onChange={(event: any) => onOptionsChange({ showDataLabels: event.target.checked })}>
          Show data labels
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Number Format"
          data-test="ECharts.NumberFormat"
          placeholder="0,0[.]00"
          defaultValue={options.numberFormat || ""}
          onChange={(event: any) => onOptionsChange({ numberFormat: event.target.value })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Percent Format"
          data-test="ECharts.PercentFormat"
          placeholder="0[.]00%"
          defaultValue={options.percentFormat || ""}
          onChange={(event: any) => onOptionsChange({ percentFormat: event.target.value })}
        />
      </Section>
    </React.Fragment>
  );
}
