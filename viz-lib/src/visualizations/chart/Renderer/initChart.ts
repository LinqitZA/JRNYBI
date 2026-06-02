import { isArray, isObject, isString, isFunction, startsWith, reduce, merge, map, each, isNil } from "lodash";
import resizeObserver from "@/services/resizeObserver";
import { Plotly, prepareData, prepareLayout, updateData, updateAxes, updateChartSize } from "../plotly";
import { formatSimpleTemplate } from "@/lib/value-format";

const navigateToUrl = (url: string, shouldOpenNewTab: boolean = true) =>
  shouldOpenNewTab
    ? window.open(url, "_blank")
    : window.location.href = url;

function createErrorHandler(errorHandler: any) {
  return (error: any) => {
    // This error happens only when chart width is 20px and looks that
    // it's safe to just ignore it: 1px less or more and chart will get fixed.
    if (isString(error) && startsWith(error, "ax.dtick error")) {
      return;
    }
    errorHandler(error);
  };
}

// This utility is intended to reduce amount of plot updates when multiple Plotly.relayout
// calls needed in order to compute/update the plot.
// `.append()` method takes an array of two element: first one is a object with updates for layout,
// and second is an optional function that will be called when plot is updated. That function may
// return an array with same structure if further updates needed.
// `.process()` merges all updates into a single object and calls `Plotly.relayout()`. After that
// it calls all callbacks, collects their return values and does another loop if needed.
function initPlotUpdater() {
  let actions: any = [];

  const updater = {
    append(action: any) {
      if (isArray(action) && isObject(action[0])) {
        actions.push(action);
      }
      return updater;
    },
    process(plotlyElement: any): Promise<void> {
      if (actions.length > 0) {
        const updates = reduce(actions, (updates, action) => merge(updates, action[0]), {});
        const handlers = map(actions, action => (isFunction(action[1]) ? action[1] : () => null));
        actions = [];
        return Plotly.relayout(plotlyElement, updates).then(() => {
          each(handlers, handler => updater.append(handler()));
          return updater.process(plotlyElement);
        });
      } else {
        return Promise.resolve();
      }
    },
  };

  return updater;
}

export default function initChart(container: any, options: any, data: any, additionalOptions: any, onError: any) {
  const handleError = createErrorHandler(onError);

  const plotlyOptions = {
    showLink: false,
    displaylogo: false,
  };

  if (additionalOptions.hidePlotlyModeBar) {
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'displayModeBar' does not exist on type '... Remove this comment to see the full error message
    plotlyOptions.displayModeBar = false;
  }

  const plotlyData = prepareData(data, options);
  const plotlyLayout = prepareLayout(container, options, plotlyData);

  let isDestroyed = false;

  let updater = initPlotUpdater();

  function createSafeFunction(fn: any) {
    // @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'args' implicitly has an 'any[]' ty... Remove this comment to see the full error message
    return (...args) => {
      if (!isDestroyed) {
        try {
          return fn(...args);
        } catch (error) {
          handleError(error);
        }
      }
    };
  }

  let unwatchResize = () => {};

  const promise = Promise.resolve()
    .then(() => Plotly.newPlot(container, plotlyData, plotlyLayout, plotlyOptions))
    .then(
      createSafeFunction(() =>
        updater
          .append(updateAxes(container, plotlyData, plotlyLayout, options))
          .append(updateChartSize(container, plotlyLayout, options))
          .process(container)
      )
    )
    .then(
      createSafeFunction(() => {
        container.on(
          "plotly_restyle",
          createSafeFunction((updates: any) => {
            // This event is triggered if some plotly data/layout has changed.
            // We need to catch only changes of traces visibility to update stacking
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'visible' does not exist on type 'object'... Remove this comment to see the full error message
            if (isArray(updates) && isObject(updates[0]) && updates[0].visible) {
              updateData(plotlyData, options);
              updater.append(updateAxes(container, plotlyData, plotlyLayout, options)).process(container);
            }
          })
        );
        options.onHover && container.on("plotly_hover", options.onHover);
        options.onUnHover && container.on("plotly_unhover", options.onUnHover);
        container.on('plotly_click',
          createSafeFunction((data: any) => {
            if (options.enableLink === true) {
              try {
                var templateValues: { [k: string]: any } = {}
                data.points.forEach((point: any, i: number) => {
                  var sourceDataElement = [...point.data?.sourceData?.entries()][point.pointNumber ?? 0]?.[1]?.row ?? {};

                  if (isNil(templateValues['@@x'])) templateValues['@@x'] = sourceDataElement.x;
                  if (isNil(templateValues['@@y'])) templateValues['@@y'] = sourceDataElement.y;

                  templateValues[`@@y${i + 1}`] = sourceDataElement.y;
                  templateValues[`@@x${i + 1}`] = sourceDataElement.x;
                })
                navigateToUrl(
                  formatSimpleTemplate(options.linkFormat, templateValues).replace(/{{\s*([^\s]+?)\s*}}/g, () => ''),
                  options.linkOpenNewTab);
              } catch (error) {
                console.error('Click error: [%s]', error.message, { error });
              }
            }

            // Feature #214 — drill-down on click.
            //
            // The host injects `options.onDrillDown(sourceRow, meta)` when
            // visualization.options.drillDown.target is configured. We
            // resolve the clicked source row (the raw query row that
            // produced the bar/slice) and hand it to the host, which builds
            // the target URL + pushes a breadcrumb step.
            // Drill-down takes precedence over cross-filter when both are
            // wired: drill-down navigates away, so dispatching a cross-
            // filter onto the parent dashboard's bus would leak state into
            // a page the user is leaving.
            let drillDispatched = false;
            try {
              if (typeof options.onDrillDown === "function" && options.drillDown && options.drillDown.target) {
                const point = (data && data.points && data.points[0]) || null;
                if (point) {
                  const sourceRow =
                    [...(point.data?.sourceData?.entries?.() ?? [])][point.pointNumber ?? 0]?.[1]
                      ?.row ?? {};
                  options.onDrillDown(sourceRow, { plotlyPoint: point });
                  drillDispatched = true;
                }
              }
            } catch (error) {
              console.error("Drill-down dispatch failed:", error);
            }
            if (drillDispatched) return;

            // Feature #213 — cross-filter on click.
            //
            // When a host (dashboard) registers an `onCrossFilter` callback
            // and cross-filtering is enabled (default ON when the host
            // injects the callback), translate the click into a
            // (dimension, value) dispatch. Dimension defaults to the chart's
            // x-column name (options.columnMapping["x"] or the raw `x`
            // mapping); the host can override via
            // `options.crossFilter.dimension`. Value is the x-coordinate of
            // the clicked point.
            //
            // The chart never dispatches its own filter back onto itself —
            // that responsibility lives in the bus (sourceWidgetId match) so
            // the click handler can stay simple here.
            try {
              if (
                typeof options.onCrossFilter === "function" &&
                options.crossFilter !== false &&
                (!options.crossFilter || options.crossFilter.enabled !== false)
              ) {
                const point = (data && data.points && data.points[0]) || null;
                if (point) {
                  // Pull the raw row first — Plotly's `x` is post-formatted,
                  // and sourceData carries the value the column was indexed
                  // by (matches what the back-end returned).
                  const sourceRow =
                    [...(point.data?.sourceData?.entries?.() ?? [])][point.pointNumber ?? 0]?.[1]
                      ?.row ?? {};
                  const xMapping = options.columnMapping
                    ? Object.keys(options.columnMapping).find(
                        (k: string) => options.columnMapping[k] === "x"
                      )
                    : null;
                  const dimension =
                    (options.crossFilter && options.crossFilter.dimension) ||
                    xMapping ||
                    "x";
                  // Prefer the raw x off the source row (un-formatted, what
                  // the SQL produced). Fall back to point.x for cases where
                  // sourceData isn't populated (e.g. preset charts).
                  let value = sourceRow.x;
                  if (value === undefined || value === null) {
                    value = point.x;
                  }
                  options.onCrossFilter(dimension, value, {
                    label: point.x != null ? String(point.x) : undefined,
                  });
                }
              }
            } catch (error) {
              // Don't break the whole click path if the host's callback throws.
              // eslint-disable-next-line no-console
              console.error("Cross-filter dispatch failed:", error);
            }
          }));

        unwatchResize = resizeObserver(
          container,
          createSafeFunction(() => {
            updater.append(updateChartSize(container, plotlyLayout, options)).process(container);
          })
        );
      })
    )
    .catch(handleError);

  const result: any = {
    initialized: promise.then(() => result),
    setZoomEnabled: createSafeFunction((allowZoom: any) => {
      const layoutUpdates = { dragmode: allowZoom ? "zoom" : false };
      // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ dragmode: string | boolean; }'... Remove this comment to see the full error message
      return Plotly.relayout(container, layoutUpdates);
    }),
    destroy: createSafeFunction(() => {
      isDestroyed = true;
      container.removeAllListeners("plotly_restyle");
      unwatchResize();
      delete container.__previousSize; // added by `updateChartSize`
      Plotly.purge(container);
    }),
  };

  return result;
}
