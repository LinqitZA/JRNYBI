/**
 * Minimal ambient type stubs for `react-sparklines`.
 *
 * The real types ship in `@types/react-sparklines` and are already listed as
 * a devDependency in viz-lib/package.json. These stubs exist only so the
 * project still type-checks before `pnpm install` has materialized the
 * @types package into node_modules — they will be transparently overridden
 * by the proper @types/react-sparklines declarations once installed (TS
 * resolves explicit `@types/*` packages first).
 */
declare module "react-sparklines" {
  import * as React from "react";

  export interface SparklinesProps {
    data?: number[];
    limit?: number;
    width?: number;
    height?: number;
    svgWidth?: number;
    svgHeight?: number;
    preserveAspectRatio?: string;
    margin?: number;
    min?: number;
    max?: number;
    style?: React.CSSProperties;
    onMouseMove?: (event: React.MouseEvent, value: number) => void;
    children?: React.ReactNode;
  }

  export interface SparklinesLineProps {
    color?: string;
    style?: React.CSSProperties;
    onMouseMove?: (event: React.MouseEvent, value: number) => void;
  }

  export interface SparklinesBarsProps {
    style?: React.CSSProperties;
    barWidth?: number;
    margin?: number;
    onMouseMove?: (event: React.MouseEvent, value: number) => void;
  }

  export interface SparklinesSpotsProps {
    size?: number;
    style?: React.CSSProperties;
    spotColors?: { [key: string]: string };
  }

  export interface SparklinesReferenceLineProps {
    type?: "max" | "min" | "mean" | "avg" | "median" | "custom";
    value?: number;
    style?: React.CSSProperties;
  }

  export class Sparklines extends React.Component<SparklinesProps> {}
  export class SparklinesLine extends React.Component<SparklinesLineProps> {}
  export class SparklinesBars extends React.Component<SparklinesBarsProps> {}
  export class SparklinesSpots extends React.Component<SparklinesSpotsProps> {}
  export class SparklinesReferenceLine extends React.Component<SparklinesReferenceLineProps> {}
  export class SparklinesCurve extends React.Component<SparklinesLineProps> {}
}
