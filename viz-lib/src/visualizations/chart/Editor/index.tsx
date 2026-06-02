/* eslint-disable react/prop-types */
import React from "react";
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";

import GeneralSettings from "./GeneralSettings";
import XAxisSettings from "./XAxisSettings";
import YAxisSettings from "./YAxisSettings";
import SeriesSettings from "./SeriesSettings";
import ColorsSettings from "./ColorsSettings";
import DataLabelsSettings from "./DataLabelsSettings";
import CustomChartSettings from "./CustomChartSettings";
import AnnotationsSettings from "./AnnotationsSettings";

import "./editor.less";

const isCustomChart = (options: any) => options.globalSeriesType === "custom";
const isPieChart = (options: any) => options.globalSeriesType === "pie";
// Feature #199: Bullet — axis/series/data-labels tabs don't apply (Plotly indicator self-renders)
const isBulletChart = (options: any) => options.globalSeriesType === "bullet";

export default createTabbedEditor([
  {
    key: "General",
    title: "General",
    component: (props: any) => (
      <React.Fragment>
        <GeneralSettings {...props} />
        {isCustomChart(props.options) && <CustomChartSettings {...props} />}
      </React.Fragment>
    ),
  },
  {
    key: "XAxis",
    title: ({ swappedAxes }: any) => (!swappedAxes ? "X Axis" : "Y Axis"),
    component: XAxisSettings,
    isAvailable: (options: any) => !isCustomChart(options) && !isPieChart(options) && !isBulletChart(options),
  },
  {
    key: "YAxis",
    title: ({ swappedAxes }: any) => (!swappedAxes ? "Y Axis" : "X Axis"),
    component: YAxisSettings,
    isAvailable: (options: any) => !isCustomChart(options) && !isPieChart(options) && !isBulletChart(options),
  },
  {
    key: "Series",
    title: "Series",
    component: SeriesSettings,
    isAvailable: (options: any) => !isCustomChart(options) && !isBulletChart(options),
  },
  {
    key: "Colors",
    title: "Colors",
    component: ColorsSettings,
    isAvailable: (options: any) => !isCustomChart(options) && !isBulletChart(options),
  },
  {
    key: "DataLabels",
    title: "Data Labels",
    component: DataLabelsSettings,
    isAvailable: (options: any) => !isCustomChart(options) && !isBulletChart(options),
  },
  {
    key: "Annotations",
    title: "Annotations",
    component: AnnotationsSettings,
    // Annotations need a real x/y axis to anchor on, so they're hidden for
    // chart types that don't have one (pie, custom, bullet).
    isAvailable: (options: any) => !isCustomChart(options) && !isPieChart(options) && !isBulletChart(options),
  },
]);
