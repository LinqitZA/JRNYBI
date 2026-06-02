import preparePieData from "./preparePieData";
import prepareHeatmapData from "./prepareHeatmapData";
import prepareDefaultData from "./prepareDefaultData";
import prepareWaterfallData from "./prepareWaterfallData";
import prepareBulletData from "./prepareBulletData";
import prepareSlopeData from "./prepareSlopeData";
import updateData from "./updateData";
import { appendAnomalyTraces } from "./anomalies";
import { appendForecastTraces } from "./forecast";
import { applyPareto } from "./pareto";
import { applyPyramid } from "./pyramid";
import { applyFacets } from "./facets";

export default function prepareData(seriesList: any, options: any) {
  switch (options.globalSeriesType) {
    case "pie":
      return updateData(preparePieData(seriesList, options), options);
    case "heatmap":
      // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
      return updateData(prepareHeatmapData(seriesList, options, options));
    case "waterfall":
      // Feature #198: Waterfall (bridge) chart
      return updateData(prepareWaterfallData(seriesList, options), options);
    case "bullet":
      // Feature #199: Bullet graph (actual vs target with qualitative bands)
      return updateData(prepareBulletData(seriesList, options), options);
    case "slope":
      // Feature #204: Slope / connected-scatter (before-vs-after per entity)
      return updateData(prepareSlopeData(seriesList, options), options);
    default: {
      const prepared = updateData(prepareDefaultData(seriesList, options), options);
      const withAnomalies = appendAnomalyTraces(prepared, options);
      // Feature #200: Forecast band overlay (line chart with confidence interval)
      const withForecast = appendForecastTraces(withAnomalies, options);
      // Feature #201: Pareto preset (sorted bars + cumulative % line on y2)
      const withPareto = applyPareto(withForecast, options);
      // Feature #203: Population pyramid (mirrored bars)
      const withPyramid = applyPyramid(withPareto, options);
      // Feature #202: Small multiples / trellis layout — runs last so the
      // partitioner sees the final trace set and assigns axisN consistently
      // across overlays + pyramid mirroring.
      return applyFacets(withPyramid, options);
    }
  }
}
