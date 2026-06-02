/* eslint-disable react/prop-types */
/**
 * ECharts shared Editor — composes the four standard tabs (General /
 * Series / Colors / Data Labels) into a tabbed editor mirroring the
 * existing Plotly-based chart Editor at viz-lib/src/visualizations/chart.
 *
 * Concrete vizes can either:
 *   1. Use this exported scaffold as-is, OR
 *   2. Call `createEChartsEditor([...])` with their own tabs (which can
 *      include the shared GeneralSettings / SeriesSettings / ColorsSettings
 *      / DataLabelsSettings components as building blocks).
 */
import React from "react";
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";

import GeneralSettings from "./GeneralSettings";
import SeriesSettings from "./SeriesSettings";
import ColorsSettings from "./ColorsSettings";
import DataLabelsSettings from "./DataLabelsSettings";

export interface EChartsEditorTab {
  key: string;
  title: string | ((props: any) => React.ReactNode);
  component: React.ComponentType<any>;
  isAvailable?: (options: any) => boolean;
}

/**
 * Default tab list — concrete vizes may pass `extraTabs` to append more
 * (e.g. {key: "Treemap", title: "Treemap", component: TreemapSettings}).
 */
export const DEFAULT_TABS: EChartsEditorTab[] = [
  { key: "General", title: "General", component: GeneralSettings },
  { key: "Series", title: "Series", component: SeriesSettings },
  { key: "Colors", title: "Colors", component: ColorsSettings },
  { key: "DataLabels", title: "Data Labels", component: DataLabelsSettings },
];

/** Build an Editor with the default tabs plus any extras supplied by a viz. */
export function createEChartsEditor(extraTabs: EChartsEditorTab[] = []) {
  return createTabbedEditor([...DEFAULT_TABS, ...extraTabs]);
}

export { GeneralSettings, SeriesSettings, ColorsSettings, DataLabelsSettings };

export default createEChartsEditor();
