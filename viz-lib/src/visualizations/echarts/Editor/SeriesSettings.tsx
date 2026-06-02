/* eslint-disable react/prop-types */
/**
 * Shared "Series" tab for ECharts-based visualizations.
 *
 * Concrete vizes typically extend with type-specific settings (e.g.
 * Treemap leaf depth, Heatmap blur factor). The shared fields are limited
 * to per-series color overrides and label visibility — anything more
 * specific lives in the per-viz Editor file.
 */
import React from "react";

import { Section, Checkbox } from "@/components/visualizations/editor";

export default function EChartsSeriesSettings({ options, onOptionsChange }: any) {
  const seriesOptions = options.seriesOptions || {};
  const seriesKeys: string[] = Object.keys(seriesOptions);

  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <Checkbox
          data-test="ECharts.AnimateSeries"
          defaultChecked={options.animation !== false}
          onChange={(event: any) => onOptionsChange({ animation: event.target.checked })}>
          Animate series on load
        </Checkbox>
      </Section>

      {seriesKeys.length === 0 ? (
        // @ts-expect-error Section children typing
        <Section>
          <div style={{ color: "var(--jrny-text-3, #64748b)", fontSize: 12 }}>
            Per-series settings will appear here once data is available.
          </div>
        </Section>
      ) : (
        seriesKeys.map(name => (
          // @ts-expect-error Section children typing
          <Section key={name}>
            <Checkbox
              data-test={`ECharts.SeriesVisible.${name}`}
              defaultChecked={seriesOptions[name]?.visible !== false}
              onChange={(event: any) =>
                onOptionsChange({
                  seriesOptions: {
                    ...seriesOptions,
                    [name]: { ...seriesOptions[name], visible: event.target.checked },
                  },
                })
              }>
              {name}
            </Checkbox>
          </Section>
        ))
      )}
    </React.Fragment>
  );
}
