/**
 * ECharts module registration — tree-shaken imports
 *
 * Apache ECharts ships as a kitchen-sink bundle by default (~1MB). To keep
 * JRNYBI's bundle delta around ~100kB gzipped, we import ONLY the specific
 * chart types and components that JRNYBI uses, plus the SVG renderer
 * (smaller than canvas for our typical dashboard sizes).
 *
 * Importing from `echarts/core` plus explicit `echarts/charts` /
 * `echarts/components` registers each module with the echarts core
 * singleton. Subsequent `import echarts from "echarts/core"` (or via the
 * Renderer below) sees the registered modules.
 *
 * To add a new chart type:
 *   1. Import its module here (e.g. `import { RadarChart } from "echarts/charts";`)
 *   2. Add it to the `echarts.use([...])` call below
 *   3. Add a registered visualization entry that calls `getOption()` to
 *      produce ECharts options (see README.md in this directory)
 *
 * IMPORTANT: never import from the top-level `echarts` package — that
 * defeats tree-shaking and pulls in the full bundle.
 */
import * as echarts from "echarts/core";

import {
  TreemapChart,
  HeatmapChart,
  GraphChart,
  CustomChart,
  SankeyChart,
  GaugeChart,
  RadarChart,
  CalendarChart,
} from "echarts/charts";

import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  VisualMapComponent,
  CalendarComponent,
  GraphicComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components";

import { LabelLayout, UniversalTransition } from "echarts/features";
import { SVGRenderer, CanvasRenderer } from "echarts/renderers";

import { jrnyLightTheme, jrnyDarkTheme } from "./themes";

let registered = false;

/**
 * Register all ECharts modules with the core singleton. Idempotent —
 * subsequent calls are no-ops. Called automatically by `Renderer.tsx` so
 * application code generally doesn't need to call this directly.
 */
export function registerEChartsModules(): typeof echarts {
  if (!registered) {
    echarts.use([
      // Charts
      TreemapChart,
      HeatmapChart,
      GraphChart,
      CustomChart,
      SankeyChart,
      GaugeChart,
      RadarChart,
      CalendarChart,

      // Components
      TitleComponent,
      TooltipComponent,
      GridComponent,
      LegendComponent,
      DataZoomComponent,
      ToolboxComponent,
      VisualMapComponent,
      CalendarComponent,
      GraphicComponent,
      MarkLineComponent,
      MarkPointComponent,

      // Features
      LabelLayout,
      UniversalTransition,

      // Renderers — register both, default to SVG at render time
      SVGRenderer,
      CanvasRenderer,
    ]);

    // Built-in JRNYBI themes — keyed by the names callers pass to <Renderer theme="...">.
    echarts.registerTheme("jrny-light", jrnyLightTheme);
    echarts.registerTheme("jrny-dark", jrnyDarkTheme);

    registered = true;
  }
  return echarts;
}

export { echarts };
export type { EChartsOption } from "echarts/types/dist/shared";
