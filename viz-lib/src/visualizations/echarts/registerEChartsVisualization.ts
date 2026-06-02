/**
 * Helper for registering an ECharts-based visualization with the JRNYBI
 * visualization registry (`registeredVisualizations.ts`).
 *
 * Concrete vizes (treemap, heatmap, network, gantt, radar, sankey-v2,
 * calendar-heatmap, ...) only need to supply:
 *   - a unique `type` constant (e.g. "ECHARTS_TREEMAP")
 *   - a display `name` (e.g. "Treemap")
 *   - a `getOption(data, options)` function returning an ECharts option object
 *   - (optional) a custom Editor — defaults to the shared scaffold
 *   - (optional) a `getOptions(existingOptions)` that fills defaults
 *
 * Returned config object plugs straight into `each(..., registerVisualization)`
 * in `registeredVisualizations.ts`.
 *
 * NOTE: this file is .ts (no JSX) on purpose so the registration helper
 * stays usable from non-JSX call sites. The Renderer it builds is created
 * via `React.createElement` rather than JSX.
 */
import React from "react";

import EChartsRenderer from "./Renderer";
import DefaultEChartsEditor from "./Editor";

export interface RegisterEChartsArgs {
  /** Unique uppercase identifier — must NOT collide with existing viz types. */
  type: string;
  /** Display name shown in the "New Visualization" picker. */
  name: string;
  /** Builds an ECharts option object from query result data + viz options. */
  getOption: (data: any, options: any) => any;
  /** Optional initial-options builder. */
  getOptions?: (options: any) => any;
  /** Optional custom Editor — defaults to the shared scaffold. */
  Editor?: React.ComponentType<any>;
  /** Optional default theme override — usually "jrny-light". */
  defaultTheme?: "jrny-light" | "jrny-dark";
  /** Layout defaults. */
  defaultColumns?: number;
  defaultRows?: number;
  minColumns?: number;
  minRows?: number;
}

const DEFAULT_GET_OPTIONS = (options: any) => ({
  showLegend: true,
  showTooltip: true,
  showDataLabels: false,
  theme: "jrny-light",
  ...options,
});

export function registerEChartsVisualization(args: RegisterEChartsArgs) {
  const {
    type,
    name,
    getOption,
    getOptions = DEFAULT_GET_OPTIONS,
    Editor = DefaultEChartsEditor,
    defaultTheme = "jrny-light",
    defaultColumns = 6,
    defaultRows = 8,
    minColumns = 1,
    minRows = 5,
  } = args;

  const Renderer: React.FC<any> = (props: any) =>
    React.createElement(EChartsRenderer, {
      data: props.data,
      options: props.options,
      getOption,
      theme: (props.options && props.options.theme) || defaultTheme,
    });
  Renderer.displayName = `EChartsRenderer(${type})`;

  return {
    type,
    name,
    getOptions,
    Renderer,
    Editor,
    defaultColumns,
    defaultRows,
    minColumns,
    minRows,
  };
}

export default registerEChartsVisualization;
