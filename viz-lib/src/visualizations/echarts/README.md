# ECharts (Apache 2.0) — second chart engine

JRNYBI uses **two** chart rendering engines side-by-side:

| Engine          | Default for                                                        | Lives in                              |
| --------------- | ------------------------------------------------------------------ | ------------------------------------- |
| Plotly          | line, bar, area, scatter, heatmap, box, pie                        | `viz-lib/src/visualizations/chart/`   |
| Apache ECharts  | treemap, calendar heatmap, network/graph, gantt, radar, sankey v2  | `viz-lib/src/visualizations/echarts/` |

ECharts handles the chart types where Plotly is weak. Plotly remains the
default for everything it does well — we do not want to fragment unless
there's a clear reason.

## Bundle size — keep it tight

The full ECharts bundle is ~1MB. We target a ~100kB gzipped delta. The
*only* way to stay there is **tree-shaking via sub-path imports**:

```ts
// ✅ DO — register only the modules you actually use
import * as echarts from "echarts/core";
import { TreemapChart, HeatmapChart } from "echarts/charts";
import { TitleComponent, TooltipComponent, GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
echarts.use([TreemapChart, HeatmapChart, TitleComponent, TooltipComponent, GridComponent, SVGRenderer]);

// ❌ DO NOT — pulls in the full bundle
import * as echarts from "echarts";
```

All registration is done once in [`index.ts`](./index.ts). When you add a
new ECharts-based viz that needs a chart type not yet registered, add it
to the `echarts.use([...])` call there — **not** in your viz file.

Verify after any change to `index.ts`:

```bash
pnpm --filter @redash/viz build
pnpm --filter @redash/viz dlx webpack-bundle-analyzer dist/stats.json
```

The ECharts bundle should remain in the ~100kB gzipped range.

## Files in this directory

| File                                | Purpose                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `index.ts`                          | Tree-shaken module registration + theme registration       |
| `Renderer.tsx`                      | Shared `<EChartsRenderer />` wrapper (resize, theme, locale) |
| `themes.ts`                         | `jrny-light` and `jrny-dark` themes (WCAG-AA palette)      |
| `registerEChartsVisualization.ts`   | Helper that produces a registry-compatible config object   |
| `Editor/index.tsx`                  | Tabbed editor scaffold (General / Series / Colors / Labels)|
| `Editor/GeneralSettings.tsx`        | Title, subtitle, legend, tooltip                           |
| `Editor/SeriesSettings.tsx`         | Per-series visibility + animation toggle                   |
| `Editor/ColorsSettings.tsx`         | Theme picker + custom palette                              |
| `Editor/DataLabelsSettings.tsx`     | Show/hide labels, number / percent format                  |
| `echarts.d.ts`                      | Ambient type stubs (used only before `pnpm install`)       |

## How to add a new ECharts-based visualization

1. **Add chart-type module** to `index.ts` if it's not yet registered, e.g.

    ```ts
    import { RadarChart } from "echarts/charts";
    // ...
    echarts.use([RadarChart, /* ...existing... */]);
    ```

2. **Write a `getOption(data, options)`** for the new viz, e.g.

    ```ts
    // viz-lib/src/visualizations/radar/getOption.ts
    export default function getOption(data: any, options: any) {
      return {
        title: { text: options.title, subtext: options.subtitle, left: "center" },
        legend: { show: options.showLegend !== false, bottom: 0 },
        tooltip: { show: options.showTooltip !== false },
        radar: { indicator: data.columns.slice(1).map((c: any) => ({ name: c.name })) },
        series: [
          {
            type: "radar",
            data: data.rows.map((r: any) => ({
              name: r[data.columns[0].name],
              value: data.columns.slice(1).map((c: any) => r[c.name]),
            })),
          },
        ],
      };
    }
    ```

3. **Register the viz** in its own `index.ts` using the helper:

    ```ts
    // viz-lib/src/visualizations/radar/index.ts
    import registerEChartsVisualization from "../echarts/registerEChartsVisualization";
    import getOption from "./getOption";

    export default registerEChartsVisualization({
      type: "ECHARTS_RADAR",
      name: "Radar",
      getOption,
    });
    ```

4. **Add it to the registry list** in `viz-lib/src/visualizations/registeredVisualizations.ts`:

    ```ts
    import radarVisualization from "./radar";
    // ...
    each(flatten([..., radarVisualization]), registerVisualization);
    ```

5. **(Optional)** Build a custom Editor by composing the shared tabs:

    ```tsx
    import { createEChartsEditor, GeneralSettings } from "../echarts/Editor";
    import RadarSpecificSettings from "./RadarSpecificSettings";

    export default createEChartsEditor([
      { key: "Radar", title: "Radar", component: RadarSpecificSettings },
    ]);
    ```

## Themes

`jrny-light` is the default. Switch at runtime:

```tsx
<EChartsRenderer
  data={data}
  options={options}
  getOption={getOption}
  theme={isDarkMode ? "jrny-dark" : "jrny-light"}
/>
```

Both themes are registered with the ECharts core singleton in `index.ts`
and use the WCAG-AA categorical palette from
`client/app/assets/less/jrny-theme.less` (the values are duplicated in
`themes.ts` — keep them in sync).

## Locale

ECharts ships with locale files. The default JRNYBI locale is `en`. To
change per-render: `<EChartsRenderer ... locale="zh" />`.
