/* eslint-disable react/prop-types */
/**
 * Shared "General" tab for ECharts-based visualizations.
 *
 * Each concrete viz (Treemap, Heatmap, Network, etc.) extends this with its
 * own type-specific settings — typically via composition:
 *
 *   <GeneralSettings {...props} />
 *   <MyChartTypeSpecificSettings {...props} />
 *
 * The fields here are intentionally minimal — only props that every
 * ECharts viz cares about (title, subtitle, legend, tooltip).
 */
import React from "react";

import { Section, Input, Checkbox } from "@/components/visualizations/editor";

export default function EChartsGeneralSettings({ options, onOptionsChange }: any) {
  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Chart Title"
          data-test="ECharts.Title"
          defaultValue={options.title || ""}
          onChange={(event: any) => onOptionsChange({ title: event.target.value })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Subtitle"
          data-test="ECharts.Subtitle"
          defaultValue={options.subtitle || ""}
          onChange={(event: any) => onOptionsChange({ subtitle: event.target.value })}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="ECharts.ShowLegend"
          defaultChecked={options.showLegend !== false}
          onChange={(event: any) => onOptionsChange({ showLegend: event.target.checked })}>
          Show legend
        </Checkbox>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="ECharts.ShowTooltip"
          defaultChecked={options.showTooltip !== false}
          onChange={(event: any) => onOptionsChange({ showTooltip: event.target.checked })}>
          Show tooltip on hover
        </Checkbox>
      </Section>
    </React.Fragment>
  );
}
