/**
 * Minimal ambient type stubs for `echarts` sub-path imports + `echarts-for-react`.
 *
 * The real types ship inside the `echarts` and `echarts-for-react` packages
 * themselves; these stubs only exist so the project type-checks before
 * `pnpm install` has materialized the deps into node_modules. They are
 * intentionally permissive (`any`) — once the real packages are installed
 * TypeScript will prefer the in-package declarations.
 */

declare module "echarts/core" {
  export function use(modules: any[]): void;
  export function registerTheme(name: string, theme: any): void;
  export function init(dom: HTMLElement | null, theme?: string | object | null, opts?: any): any;
  export function dispose(target: any): void;
  export function connect(group: string | any[]): void;
  export function disconnect(group: string): void;
  const echarts: any;
  export default echarts;
}

declare module "echarts/charts" {
  export const TreemapChart: any;
  export const HeatmapChart: any;
  export const GraphChart: any;
  export const CustomChart: any;
  export const SankeyChart: any;
  export const GaugeChart: any;
  export const RadarChart: any;
  export const CalendarChart: any;
  export const LineChart: any;
  export const BarChart: any;
  export const PieChart: any;
  export const ScatterChart: any;
  export const BoxplotChart: any;
  export const FunnelChart: any;
  export const SunburstChart: any;
  export const TreeChart: any;
}

declare module "echarts/components" {
  export const TitleComponent: any;
  export const TooltipComponent: any;
  export const GridComponent: any;
  export const LegendComponent: any;
  export const DataZoomComponent: any;
  export const ToolboxComponent: any;
  export const VisualMapComponent: any;
  export const CalendarComponent: any;
  export const GraphicComponent: any;
  export const MarkLineComponent: any;
  export const MarkPointComponent: any;
  export const PolarComponent: any;
  export const RadarComponent: any;
  export const GeoComponent: any;
  export const ParallelComponent: any;
  export const SingleAxisComponent: any;
  export const BrushComponent: any;
  export const TimelineComponent: any;
  export const DatasetComponent: any;
  export const TransformComponent: any;
  export const AriaComponent: any;
}

declare module "echarts/features" {
  export const LabelLayout: any;
  export const UniversalTransition: any;
}

declare module "echarts/renderers" {
  export const SVGRenderer: any;
  export const CanvasRenderer: any;
}

declare module "echarts/types/dist/shared" {
  // Real package exports a huge union of typed option interfaces. We just
  // expose the umbrella name as `any` for development convenience.
  export type EChartsOption = any;
  export type SeriesOption = any;
  export type ECElementEvent = any;
}

declare module "echarts-for-react" {
  import * as React from "react";

  export interface EChartsReactProps {
    option: any;
    notMerge?: boolean;
    lazyUpdate?: boolean;
    style?: React.CSSProperties;
    className?: string;
    theme?: string | object;
    onChartReady?: (chartInstance: any) => void;
    showLoading?: boolean;
    loadingOption?: any;
    onEvents?: Record<string, (...args: any[]) => void>;
    opts?: {
      renderer?: "canvas" | "svg";
      width?: number | string;
      height?: number | string;
      devicePixelRatio?: number;
      locale?: string;
    };
    echarts?: any;
  }

  export default class EChartsReactCore extends React.Component<EChartsReactProps> {
    getEchartsInstance(): any;
  }
}

declare module "echarts-for-react/lib/core" {
  export { default } from "echarts-for-react";
  export * from "echarts-for-react";
}
