import { isArray, map, mapValues, includes, some, each, difference, toNumber, isFinite } from "lodash";
import React, { useMemo } from "react";
import { Section, Select, Checkbox, InputNumber, ContextHelp, Input } from "@/components/visualizations/editor";
import { UpdateOptionsStrategy } from "@/components/visualizations/editor/createTabbedEditor";
import { EditorPropTypes } from "@/visualizations/prop-types";
import { AllColorPalettes } from "@/visualizations/ColorPalette";
import ChartTypeSelect from "./ChartTypeSelect";
import ColumnMappingSelect from "./ColumnMappingSelect";
import { useDebouncedCallback } from "use-debounce/lib";

function getAvailableColumnMappingTypes(options: any) {
  // Feature #199: Bullet — `x` is the metric label; `y` is replaced by `actualValue`
  if (options.globalSeriesType === "bullet") {
    return ["x", "actualValue", "targetValue", "bandLower", "bandUpper"];
  }

  // Feature #204: Slope chart — exactly the same mapping shape as a multi-series
  // line chart (x = period, y = numeric value, series = entity). Falls through.
  // Feature #205: Combo — same x/y/series mapping as a column chart. Falls through.

  const result = ["x", "y"];

  // Waterfall has no group-by — each row IS one bar in the bridge.
  if (!includes(["custom", "heatmap", "waterfall"], options.globalSeriesType)) {
    result.push("series");
  }

  if (options.globalSeriesType === "bubble" || some(options.seriesOptions, { type: "bubble" })) {
    result.push("size");
  }

  if (options.globalSeriesType === "heatmap") {
    result.push("zVal");
  }

  // Waterfall doesn't carry error bars
  if (!includes(["custom", "bubble", "heatmap", "waterfall"], options.globalSeriesType)) {
    result.push("yError");
  }

  // Feature #198: Waterfall — measure column ('relative' / 'total' / 'absolute')
  if (options.globalSeriesType === "waterfall") {
    result.push("measure");
  }

  // Feature #200: Forecast band overlay — only on line / area / column
  if (
    options.forecast && options.forecast.enabled &&
    includes(["line", "area", "column"], options.globalSeriesType)
  ) {
    result.push("forecastValue", "forecastLower", "forecastUpper");
  }

  // Feature #202: Small multiples / trellis — facet column mapping appears
  // once the facet preset is enabled and the chart type is compatible.
  if (
    options.facet && options.facet.enabled &&
    includes(["line", "area", "column", "scatter", "bubble"], options.globalSeriesType)
  ) {
    result.push("facet");
  }

  return result;
}

function getMappedColumns(options: any, availableColumns: any) {
  const mappedColumns = {};
  const availableTypes = getAvailableColumnMappingTypes(options);
  each(availableTypes, type => {
    // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    mappedColumns[type] = ColumnMappingSelect.MappingTypes[type].multiple ? [] : null;
  });

  availableColumns = map(availableColumns, c => c.name);
  const usedColumns: any = [];

  each(options.columnMapping, (type, column) => {
    if (includes(availableColumns, column) && includes(availableTypes, type)) {
      // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      const { multiple } = ColumnMappingSelect.MappingTypes[type];
      if (multiple) {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        mappedColumns[type].push(column);
      } else {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        mappedColumns[type] = column;
      }
      usedColumns.push(column);
    }
  });

  return {
    mappedColumns,
    unusedColumns: difference(availableColumns, usedColumns),
  };
}

function mappedColumnsToColumnMappings(mappedColumns: any) {
  const result = {};
  each(mappedColumns, (value, type) => {
    if (isArray(value)) {
      each(value, v => {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        result[v] = type;
      });
    } else {
      if (value) {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        result[value] = type;
      }
    }
  });
  return result;
}

export default function GeneralSettings({ options, data, onOptionsChange }: any) {
  const { mappedColumns, unusedColumns } = useMemo(() => getMappedColumns(options, data.columns), [
    options,
    data.columns,
  ]);

  function handleGlobalSeriesTypeChange(globalSeriesType: any) {
    onOptionsChange({
      globalSeriesType,
      showDataLabels: globalSeriesType === "pie",
      swappedAxes: false,
      seriesOptions: mapValues(options.seriesOptions, series => ({
        ...series,
        type: globalSeriesType,
      })),
    });
  }

  function handleColumnMappingChange(column: any, type: any) {
    const columnMapping = mappedColumnsToColumnMappings({
      ...mappedColumns,
      [type]: column,
    });
    onOptionsChange({ columnMapping }, UpdateOptionsStrategy.shallowMerge);
  }

  function handleLegendPlacementChange(value: any) {
    if (value === "hidden") {
      onOptionsChange({ legend: { enabled: false } });
    } else {
      onOptionsChange({ legend: { enabled: true, placement: value } });
    }
  }

  function handleAxesSwapping() {
    // moves any item in the right Y axis to the left one
    const seriesOptions = mapValues(options.seriesOptions, series => ({
      ...series,
      yAxis: 0,
    }));
    onOptionsChange({ swappedAxes: !options.swappedAxes, seriesOptions });
  }

  const [debouncedOnOptionsChange] = useDebouncedCallback(onOptionsChange, 200);

  return (
    <React.Fragment>
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <ChartTypeSelect
          // @ts-expect-error ts-migrate(2322) FIXME: Type '{ label: string; "data-test": string; defaul... Remove this comment to see the full error message
          label="Chart Type"
          data-test="Chart.GlobalSeriesType"
          defaultValue={options.globalSeriesType}
          onChange={handleGlobalSeriesTypeChange}
        />
      </Section>

      {includes(["column", "line", "box"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Checkbox
            data-test="Chart.SwappedAxes"
            defaultChecked={options.swappedAxes}
            checked={options.swappedAxes}
            onChange={handleAxesSwapping}>
            Horizontal Chart
          </Checkbox>
        </Section>
      )}

      {map(mappedColumns, (value, type) => (
        <ColumnMappingSelect
          // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'never'.
          key={type}
          // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'never'.
          type={type}
          value={value}
          // @ts-expect-error ts-migrate(2322) FIXME: Type 'any' is not assignable to type 'never'.
          areAxesSwapped={options.swappedAxes}
          // @ts-expect-error ts-migrate(2322) FIXME: Type 'unknown[]' is not assignable to type 'never'... Remove this comment to see the full error message
          availableColumns={unusedColumns}
          // @ts-expect-error ts-migrate(2322) FIXME: Type '(column: any, type: any) => void' is not ass... Remove this comment to see the full error message
          onChange={handleColumnMappingChange}
        />
      ))}

      {includes(["bubble"], options.globalSeriesType) && (
        <React.Fragment>
          {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
          <Section>
            <InputNumber
              label="Bubble Size Coefficient"
              data-test="Chart.BubbleCoefficient"
              defaultValue={options.coefficient}
              onChange={(value: any) => onOptionsChange({ coefficient: toNumber(value) })}
            />
          </Section>

          {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
          <Section>
            <Select
              label="Bubble Size Proportional To"
              data-test="Chart.SizeMode"
              defaultValue={options.sizemode}
              onChange={(mode: any) => onOptionsChange({ sizemode: mode })}>
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              <Select.Option value="area" data-test="Chart.SizeMode.Area">
                Area
                {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              </Select.Option>
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              <Select.Option value="diameter" data-test="Chart.SizeMode.Diameter">
                Diameter
                {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              </Select.Option>
            </Select>
          </Section>
        </React.Fragment>
      )}

      {/* Feature #198: Waterfall chart options — connector + semantic colors */}
      {includes(["waterfall"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Checkbox
            data-test="Chart.Waterfall.Connector"
            defaultChecked={options.waterfall ? options.waterfall.connectorVisible !== false : true}
            onChange={(event: any) =>
              onOptionsChange({ waterfall: { connectorVisible: event.target.checked } })
            }>
            Show connector lines between bars
          </Checkbox>
          <Input
            label="Increasing bar color"
            data-test="Chart.Waterfall.IncreasingColor"
            defaultValue={options.waterfall?.increasingColor || "#117a3b"}
            onChange={(e: any) =>
              debouncedOnOptionsChange({ waterfall: { increasingColor: e.target.value } })
            }
          />
          <Input
            label="Decreasing bar color"
            data-test="Chart.Waterfall.DecreasingColor"
            defaultValue={options.waterfall?.decreasingColor || "#b42318"}
            onChange={(e: any) =>
              debouncedOnOptionsChange({ waterfall: { decreasingColor: e.target.value } })
            }
          />
          <Input
            label="Total bar color"
            data-test="Chart.Waterfall.TotalColor"
            defaultValue={options.waterfall?.totalColor || "#475569"}
            onChange={(e: any) =>
              debouncedOnOptionsChange({ waterfall: { totalColor: e.target.value } })
            }
          />
          <ContextHelp
            placement="topLeft"
            arrowPointAtCenter
            // @ts-expect-error ts-migrate(2322)
            icon={ContextHelp.defaultIcon}>
            {/* @ts-expect-error ts-migrate(2322) */}
            <div>
              The <b>Measure Column</b> determines how each bar contributes to the running total.
              Valid values per row: <code>relative</code> (default: adds/subtracts), <code>total</code>
              (renders the running sum to date as a solid bar), <code>absolute</code> (resets the running total).
            </div>
          </ContextHelp>
        </Section>
      )}

      {/* Feature #199: Bullet graph — band + target colors */}
      {includes(["bullet"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Input
            label="Poor band color"
            data-test="Chart.Bullet.PoorColor"
            defaultValue={options.bullet?.poorColor || "#fee2e2"}
            onChange={(e: any) => debouncedOnOptionsChange({ bullet: { poorColor: e.target.value } })}
          />
          <Input
            label="Satisfactory band color"
            data-test="Chart.Bullet.SatisfactoryColor"
            defaultValue={options.bullet?.satisfactoryColor || "#fef3c7"}
            onChange={(e: any) => debouncedOnOptionsChange({ bullet: { satisfactoryColor: e.target.value } })}
          />
          <Input
            label="Good band color"
            data-test="Chart.Bullet.GoodColor"
            defaultValue={options.bullet?.goodColor || "#d1fae5"}
            onChange={(e: any) => debouncedOnOptionsChange({ bullet: { goodColor: e.target.value } })}
          />
          <Input
            label="Actual bar color"
            data-test="Chart.Bullet.BarColor"
            defaultValue={options.bullet?.barColor || "#0f172a"}
            onChange={(e: any) => debouncedOnOptionsChange({ bullet: { barColor: e.target.value } })}
          />
          <Input
            label="Target marker color"
            data-test="Chart.Bullet.TargetColor"
            defaultValue={options.bullet?.targetColor || "#b42318"}
            onChange={(e: any) => debouncedOnOptionsChange({ bullet: { targetColor: e.target.value } })}
          />
          <ContextHelp
            placement="topLeft"
            arrowPointAtCenter
            // @ts-expect-error ts-migrate(2322)
            icon={ContextHelp.defaultIcon}>
            {/* @ts-expect-error ts-migrate(2322) */}
            <div>
              One row per KPI: <code>x</code> = label, <code>actualValue</code> = achieved,
              <code>targetValue</code> = goal, <code>bandLower</code>/<code>bandUpper</code> = poor /
              satisfactory thresholds. Bullets stack vertically as a scorecard.
            </div>
          </ContextHelp>
        </Section>
      )}

      {/* Feature #204: Slope / connected-scatter — direction-coloured lines */}
      {includes(["slope"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Input
            label="Upward (positive change) line color"
            data-test="Chart.Slope.UpColor"
            defaultValue={options.slope?.upColor || "#117a3b"}
            onChange={(e: any) => debouncedOnOptionsChange({ slope: { upColor: e.target.value } })}
          />
          <Input
            label="Downward (negative change) line color"
            data-test="Chart.Slope.DownColor"
            defaultValue={options.slope?.downColor || "#b42318"}
            onChange={(e: any) => debouncedOnOptionsChange({ slope: { downColor: e.target.value } })}
          />
          <Input
            label="Neutral / unchanged line color"
            data-test="Chart.Slope.NeutralColor"
            defaultValue={options.slope?.neutralColor || "#94a3b8"}
            onChange={(e: any) => debouncedOnOptionsChange({ slope: { neutralColor: e.target.value } })}
          />
          <Checkbox
            data-test="Chart.Slope.EndpointLabels"
            defaultChecked={options.slope ? options.slope.showEndpointLabels !== false : true}
            onChange={(event: any) =>
              onOptionsChange({ slope: { showEndpointLabels: event.target.checked } })
            }>
            Label endpoints (entity name + value at start, value at end)
          </Checkbox>
          <InputNumber
            label="Line width (px)"
            data-test="Chart.Slope.LineWidth"
            min={0.5}
            max={8}
            step={0.5}
            defaultValue={typeof options.slope?.lineWidth === "number" ? options.slope.lineWidth : 1.5}
            onChange={(value: any) =>
              onOptionsChange({ slope: { lineWidth: toNumber(value) || 1.5 } })
            }
          />
          <InputNumber
            label="Marker size (px)"
            data-test="Chart.Slope.MarkerSize"
            min={1}
            max={20}
            defaultValue={typeof options.slope?.markerSize === "number" ? options.slope.markerSize : 6}
            onChange={(value: any) =>
              onOptionsChange({ slope: { markerSize: toNumber(value) || 6 } })
            }
          />
          <ContextHelp
            placement="topLeft"
            arrowPointAtCenter
            // @ts-expect-error ts-migrate(2322)
            icon={ContextHelp.defaultIcon}>
            {/* @ts-expect-error ts-migrate(2322) */}
            <div>
              Each <b>entity</b> (group-by series) becomes one thin line with two markers — typically
              "before" and "after". Color encodes the direction of change (up / down / flat).
              Use <code>x</code> for the period column (with exactly two values), <code>y</code> for the
              numeric value, and <b>Group by</b> for the entity name (e.g. salesperson, country, SKU).
            </div>
          </ContextHelp>
        </Section>
      )}

      {/* Feature #205: Combo / dual-axis — hint + per-series axis explanation */}
      {includes(["combo"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <ContextHelp
            placement="topLeft"
            arrowPointAtCenter
            // @ts-expect-error ts-migrate(2322)
            icon={ContextHelp.defaultIcon}>
            {/* @ts-expect-error ts-migrate(2322) */}
            <div>
              <b>Combo</b> renders one chart with mixed series types and a dual y-axis. By default,
              the first series becomes a <b>bar</b> (left axis) and the rest become <b>lines</b> (right
              axis). Open the <b>Series</b> tab to flip a series between Bar / Line and assign it
              to the Left or Right y-axis. Useful for mixing absolute and relative measures —
              e.g. Revenue (bar, left) + Margin % (line, right).
            </div>
          </ContextHelp>
        </Section>
      )}

      {/* Feature #200: Forecast band overlay — toggle + band/divider options */}
      {includes(["line", "area", "column"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Checkbox
            data-test="Chart.Forecast.Enabled"
            defaultChecked={!!(options.forecast && options.forecast.enabled)}
            checked={!!(options.forecast && options.forecast.enabled)}
            onChange={(event: any) =>
              onOptionsChange({ forecast: { enabled: event.target.checked } })
            }>
            Show forecast band overlay
          </Checkbox>
          {options.forecast && options.forecast.enabled && (
            <div style={{ marginTop: 8, marginLeft: 24 }}>
              <Input
                label="Band color"
                data-test="Chart.Forecast.BandColor"
                defaultValue={options.forecast.bandColor || "#1d4ed8"}
                onChange={(e: any) =>
                  debouncedOnOptionsChange({ forecast: { bandColor: e.target.value } })
                }
              />
              <InputNumber
                label="Band opacity (0–1)"
                data-test="Chart.Forecast.BandOpacity"
                min={0}
                max={1}
                step={0.05}
                defaultValue={options.forecast.bandOpacity ?? 0.2}
                onChange={(value: any) =>
                  onOptionsChange({ forecast: { bandOpacity: toNumber(value) } })
                }
              />
              <Select
                label="Forecast line style"
                data-test="Chart.Forecast.LineDash"
                defaultValue={options.forecast.forecastLineDash || "dash"}
                onChange={(val: any) => onOptionsChange({ forecast: { forecastLineDash: val } })}>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="solid">Solid</Select.Option>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="dash">Dashed</Select.Option>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="dot">Dotted</Select.Option>
              </Select>
              <Checkbox
                data-test="Chart.Forecast.ShowDivider"
                defaultChecked={options.forecast.showDivider !== false}
                onChange={(event: any) =>
                  onOptionsChange({ forecast: { showDivider: event.target.checked } })
                }>
                Show vertical divider at forecast start
              </Checkbox>
              <ContextHelp
                placement="topLeft"
                arrowPointAtCenter
                // @ts-expect-error ts-migrate(2322)
                icon={ContextHelp.defaultIcon}>
                {/* @ts-expect-error ts-migrate(2322) */}
                <div>
                  Your query should produce three forecast columns aligned to the X axis:{" "}
                  <code>forecast_value</code>, <code>forecast_lower</code>, <code>forecast_upper</code>.
                  Leave these <code>NULL</code> for actuals; populate them for the forecast region.
                  Tip: use a <code>UNION ALL</code> of an actuals CTE and a forecast CTE.
                </div>
              </ContextHelp>
            </div>
          )}
        </Section>
      )}

      {/* Feature #201: Pareto preset — sorted descending bars + cumulative % line on y2 */}
      {includes(["column"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Checkbox
            data-test="Chart.Pareto.Enabled"
            defaultChecked={!!(options.pareto && options.pareto.enabled)}
            checked={!!(options.pareto && options.pareto.enabled)}
            onChange={(event: any) =>
              onOptionsChange({ pareto: { enabled: event.target.checked } })
            }>
            Pareto preset (sort bars descending + cumulative %)
          </Checkbox>
          {options.pareto && options.pareto.enabled && (
            <div style={{ marginTop: 8, marginLeft: 24 }}>
              <Input
                label="Cumulative line color"
                data-test="Chart.Pareto.CumulativeColor"
                defaultValue={options.pareto.cumulativeColor || "#b42318"}
                onChange={(e: any) =>
                  debouncedOnOptionsChange({ pareto: { cumulativeColor: e.target.value } })
                }
              />
              <Checkbox
                data-test="Chart.Pareto.ShowThreshold"
                defaultChecked={options.pareto.showThreshold !== false}
                onChange={(event: any) =>
                  onOptionsChange({ pareto: { showThreshold: event.target.checked } })
                }>
                Highlight threshold line
              </Checkbox>
              {options.pareto.showThreshold !== false && (
                <InputNumber
                  label="Threshold (0–1, e.g. 0.8 for 80%)"
                  data-test="Chart.Pareto.Threshold"
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={typeof options.pareto.threshold === "number" ? options.pareto.threshold : 0.8}
                  onChange={(value: any) =>
                    onOptionsChange({ pareto: { threshold: toNumber(value) } })
                  }
                />
              )}
              <ContextHelp
                placement="topLeft"
                arrowPointAtCenter
                // @ts-expect-error ts-migrate(2322)
                icon={ContextHelp.defaultIcon}>
                {/* @ts-expect-error ts-migrate(2322) */}
                <div>
                  Pareto sorts the bars by Y descending and overlays a cumulative-percentage
                  line on a secondary axis. Useful for 80/20 analysis on vendor spend,
                  slow-moving SKUs, customer revenue concentration, defect categories.
                </div>
              </ContextHelp>
            </div>
          )}
        </Section>
      )}

      {/* Feature #202: Small multiples / trellis layout — facet the chart into a grid */}
      {includes(["line", "area", "column", "scatter", "bubble"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Checkbox
            data-test="Chart.Facet.Enabled"
            defaultChecked={!!(options.facet && options.facet.enabled)}
            checked={!!(options.facet && options.facet.enabled)}
            onChange={(event: any) =>
              onOptionsChange({ facet: { enabled: event.target.checked } })
            }>
            Enable small multiples (facet into subplots)
          </Checkbox>
          {options.facet && options.facet.enabled && (
            <div style={{ marginTop: 8, marginLeft: 24 }}>
              <InputNumber
                label="Columns (blank = auto)"
                data-test="Chart.Facet.Columns"
                min={1}
                max={12}
                defaultValue={options.facet.columns ?? undefined}
                onChange={(value: any) => {
                  const n = toNumber(value);
                  onOptionsChange({ facet: { columns: isFinite(n) && n > 0 ? n : null } });
                }}
              />
              <Checkbox
                data-test="Chart.Facet.ShareX"
                defaultChecked={options.facet.shareX !== false}
                onChange={(event: any) =>
                  onOptionsChange({ facet: { shareX: event.target.checked } })
                }>
                Share X axis across subplots
              </Checkbox>
              <Checkbox
                data-test="Chart.Facet.ShareY"
                defaultChecked={options.facet.shareY !== false}
                onChange={(event: any) =>
                  onOptionsChange({ facet: { shareY: event.target.checked } })
                }>
                Share Y axis across subplots
              </Checkbox>
              <Checkbox
                data-test="Chart.Facet.OuterLabels"
                defaultChecked={options.facet.showOnlyOuterLabels !== false}
                onChange={(event: any) =>
                  onOptionsChange({ facet: { showOnlyOuterLabels: event.target.checked } })
                }>
                Compact axis labels (outer rows/cols only)
              </Checkbox>
              <InputNumber
                label="Max facets (safety cap)"
                data-test="Chart.Facet.MaxFacets"
                min={1}
                max={100}
                defaultValue={options.facet.maxFacets ?? 16}
                onChange={(value: any) =>
                  onOptionsChange({ facet: { maxFacets: toNumber(value) || 16 } })
                }
              />
              <ContextHelp
                placement="topLeft"
                arrowPointAtCenter
                // @ts-expect-error ts-migrate(2322)
                icon={ContextHelp.defaultIcon}>
                {/* @ts-expect-error ts-migrate(2322) */}
                <div>
                  Picks a column to split into subplots (one plot per unique value).
                  Choose the facet column below. When Columns is blank the grid is
                  auto-sized as a near-square (sqrt of facet count).
                </div>
              </ContextHelp>
            </div>
          )}
        </Section>
      )}

      {/* Feature #203: Population pyramid preset — mirrored bars */}
      {includes(["column"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Checkbox
            data-test="Chart.Pyramid.Enabled"
            defaultChecked={!!(options.pyramid && options.pyramid.enabled)}
            checked={!!(options.pyramid && options.pyramid.enabled)}
            onChange={(event: any) =>
              onOptionsChange({ pyramid: { enabled: event.target.checked } })
            }>
            Population pyramid preset (mirrored bars)
          </Checkbox>
          {options.pyramid && options.pyramid.enabled && (
            <div style={{ marginTop: 8, marginLeft: 24 }}>
              <Input
                label="Left series name (blank = first)"
                data-test="Chart.Pyramid.LeftSeries"
                defaultValue={options.pyramid.leftSeries || ""}
                onChange={(e: any) =>
                  debouncedOnOptionsChange({ pyramid: { leftSeries: e.target.value || null } })
                }
              />
              <Input
                label="Right series name (blank = second)"
                data-test="Chart.Pyramid.RightSeries"
                defaultValue={options.pyramid.rightSeries || ""}
                onChange={(e: any) =>
                  debouncedOnOptionsChange({ pyramid: { rightSeries: e.target.value || null } })
                }
              />
              <Input
                label="Left side color"
                data-test="Chart.Pyramid.LeftColor"
                defaultValue={options.pyramid.leftColor || "#1d4ed8"}
                onChange={(e: any) =>
                  debouncedOnOptionsChange({ pyramid: { leftColor: e.target.value } })
                }
              />
              <Input
                label="Right side color"
                data-test="Chart.Pyramid.RightColor"
                defaultValue={options.pyramid.rightColor || "#b42318"}
                onChange={(e: any) =>
                  debouncedOnOptionsChange({ pyramid: { rightColor: e.target.value } })
                }
              />
              <ContextHelp
                placement="topLeft"
                arrowPointAtCenter
                // @ts-expect-error ts-migrate(2322)
                icon={ContextHelp.defaultIcon}>
                {/* @ts-expect-error ts-migrate(2322) */}
                <div>
                  Symmetric back-to-back bars sharing one category axis. Pair with
                  <b> Horizontal Chart</b> (above) for the canonical demographic shape.
                  Configure two series via <b>Group by</b> and pick which is left/right.
                  Labels and tooltips show absolute values regardless of the mirroring.
                </div>
              </ContextHelp>
            </div>
          )}
        </Section>
      )}

      {includes(["pie"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Select
            label="Direction"
            data-test="Chart.PieDirection"
            defaultValue={options.direction.type}
            onChange={(type: any) => onOptionsChange({ direction: { type } })}>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value="counterclockwise" data-test="Chart.PieDirection.Counterclockwise">
              Counterclockwise
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value="clockwise" data-test="Chart.PieDirection.Clockwise">
              Clockwise
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          </Select>
          <Select
            label="Sort"
            defaultValue={options.piesort}
            onChange={(val: any) => onOptionsChange({ piesort: val })}>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value={true}>
              True
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value={false}>
              False
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          </Select>
        </Section>
      )}

      {!includes(["custom", "heatmap", "bullet", "slope"], options.globalSeriesType) && (
        <React.Fragment>
          {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
          <Section>
            <Select
              label="Legend Placement"
              data-test="Chart.LegendPlacement"
              value={options.legend.enabled ? options.legend.placement : "hidden"}
              onChange={handleLegendPlacementChange}>
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              <Select.Option value="hidden" data-test="Chart.LegendPlacement.HideLegend">
                Hide legend
                {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              </Select.Option>
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              <Select.Option value="auto" data-test="Chart.LegendPlacement.Auto">
                Right
                {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              </Select.Option>
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              <Select.Option value="below" data-test="Chart.LegendPlacement.Below">
                Bottom
                {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
              </Select.Option>
            </Select>
          </Section>

          {options.legend.enabled && (
            // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
            <Section>
              <Select
                label="Legend Items Order"
                data-test="Chart.LegendItemsOrder"
                value={options.legend.traceorder}
                onChange={(traceorder: any) => onOptionsChange({ legend: { traceorder } })}>
                {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
                <Select.Option value="normal" data-test="Chart.LegendItemsOrder.Normal">
                  Normal
                  {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
                </Select.Option>
                {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
                <Select.Option value="reversed" data-test="Chart.LegendItemsOrder.Reversed">
                  Reversed
                  {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
                </Select.Option>
              </Select>
            </Section>
          )}
        </React.Fragment>
      )}

      {includes(["box"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Checkbox
            data-test="Chart.ShowPoints"
            defaultChecked={options.showpoints}
            onChange={event => onOptionsChange({ showpoints: event.target.checked })}>
            Show All Points
          </Checkbox>
        </Section>
      )}

      {!includes(["custom", "heatmap", "waterfall", "bullet", "slope"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Select
            label="Stacking"
            data-test="Chart.Stacking"
            defaultValue={options.series.stacking}
            disabled={!includes(["line", "area", "column", "combo"], options.globalSeriesType)}
            onChange={(stacking: any) => onOptionsChange({ series: { stacking } })}>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value={null} data-test="Chart.Stacking.Disabled">
              Disabled
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value="stack" data-test="Chart.Stacking.Stack">
              Stack
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          </Select>
        </Section>
      )}

      {includes(["line", "area", "column"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Checkbox
            data-test="Chart.NormalizeValues"
            defaultChecked={options.series.percentValues}
            onChange={event => onOptionsChange({ series: { percentValues: event.target.checked } })}>
            Normalize values to percentage
          </Checkbox>
        </Section>
      )}

      {includes(["line", "area", "column"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Checkbox
            data-test="Chart.ShowAnomalies"
            defaultChecked={options.showAnomalies}
            checked={!!options.showAnomalies}
            onChange={event => onOptionsChange({ showAnomalies: event.target.checked })}>
            Show anomalies
          </Checkbox>
          {options.showAnomalies && (
            <div style={{ marginTop: 8, marginLeft: 24 }}>
              <InputNumber
                label="Rolling window (points)"
                data-test="Chart.AnomalyWindow"
                min={3}
                max={1000}
                defaultValue={options.anomalyWindow || 30}
                onChange={(value: any) => onOptionsChange({ anomalyWindow: toNumber(value) || 30 })}
              />
              <InputNumber
                label="Z-score threshold (σ)"
                data-test="Chart.AnomalyThreshold"
                min={0.5}
                max={10}
                step={0.1}
                defaultValue={options.anomalyThreshold || 2}
                onChange={(value: any) => onOptionsChange({ anomalyThreshold: toNumber(value) || 2 })}
              />
            </div>
          )}
        </Section>
      )}

      {includes(["line", "area"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Select
            label="Line Shape"
            data-test="Chart.LineShape"
            defaultValue={options.lineShape}
            onChange={(val: any) => onOptionsChange({ lineShape: val })}>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value="linear" data-test="Chart.LineShape.Linear">
              Linear
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value="spline" data-test="Chart.LineShape.Spline">
              Spline
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value="hv" data-test="Chart.LineShape.HorizontalVertical">
              Horizontal-Vertical
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value="vh" data-test="Chart.LineShape.VerticalHorizontal">
              Vertical-Horizontal
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          </Select>
        </Section>
      )}

      {!includes(["custom", "heatmap", "bubble", "waterfall", "bullet", "slope"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
        <Section>
          <Select
            label="Missing and NULL values"
            data-test="Chart.MissingValues"
            defaultValue={options.missingValuesAsZero ? 1 : 0}
            onChange={(value: any) => onOptionsChange({ missingValuesAsZero: !!value })}>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value={0} data-test="Chart.MissingValues.Keep">
              Do not display in chart
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
            {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            <Select.Option value={1} data-test="Chart.MissingValues.Zero">
              Convert to 0 and display in chart
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          </Select>
        </Section>
      )}

      {/* Feature #187: Smart contextual tooltips — delta + sparkline. Only
          shown for line / area / column charts since that's where deltas and
          a trailing sparkline are meaningful. The runtime applicability check
          ALSO requires a datetime x-axis, so toggling it on a category chart
          quietly falls back to Plotly's default tooltip. */}
      {includes(["line", "area", "column"], options.globalSeriesType) && (
        // @ts-expect-error ts-migrate(2745)
        <Section>
          <Checkbox
            data-test="Chart.ContextualTooltip.Enabled"
            defaultChecked={!!(options.contextualTooltip && options.contextualTooltip.enabled)}
            checked={!!(options.contextualTooltip && options.contextualTooltip.enabled)}
            onChange={(event: any) =>
              onOptionsChange({ contextualTooltip: { enabled: event.target.checked } })
            }>
            Smart contextual tooltips (delta + sparkline)
          </Checkbox>
          {options.contextualTooltip && options.contextualTooltip.enabled && (
            <div style={{ marginTop: 8, marginLeft: 24 }}>
              <Select
                label="Compare to"
                data-test="Chart.ContextualTooltip.ComparisonPeriod"
                defaultValue={options.contextualTooltip.comparisonPeriod || "auto"}
                onChange={(value: any) =>
                  onOptionsChange({ contextualTooltip: { comparisonPeriod: value } })
                }>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="auto" data-test="Chart.ContextualTooltip.Auto">Auto (best fit)</Select.Option>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="previous" data-test="Chart.ContextualTooltip.Previous">Previous point</Select.Option>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="wow" data-test="Chart.ContextualTooltip.WoW">Week-over-week</Select.Option>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="mom" data-test="Chart.ContextualTooltip.MoM">Month-over-month</Select.Option>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="qoq" data-test="Chart.ContextualTooltip.QoQ">Quarter-over-quarter</Select.Option>
                {/* @ts-expect-error ts-migrate(2339) */}
                <Select.Option value="yoy" data-test="Chart.ContextualTooltip.YoY">Year-over-year</Select.Option>
              </Select>
              <InputNumber
                label="Sparkline window (points)"
                data-test="Chart.ContextualTooltip.SparklineWindow"
                defaultValue={options.contextualTooltip.sparklineWindow || 8}
                min={2}
                max={60}
                onChange={(value: any) => {
                  const n = toNumber(value);
                  if (isFinite(n)) {
                    onOptionsChange({ contextualTooltip: { sparklineWindow: Math.max(2, Math.min(60, n)) } });
                  }
                }}
              />
              <ContextHelp
                placement="topLeft"
                arrowPointAtCenter
                // @ts-expect-error ts-migrate(2322)
                icon={ContextHelp.defaultIcon}>
                {/* @ts-expect-error ts-migrate(2322) */}
                <div>
                  Requires a <b>datetime</b> x-axis. Each hover card shows the value,
                  Δ vs the prior period, and a mini sparkline of the trailing window.
                </div>
              </ContextHelp>
            </div>
          )}
        </Section>
      )}

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Checkbox
          data-test="Chart.EnableClickEvents"
          defaultChecked={options.enableLink}
          onChange={event => onOptionsChange({ enableLink: event.target.checked })}>
          Enable click events
        </Checkbox>
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Checkbox
          data-test="Chart.EnableClickEvents.NewTab"
          defaultChecked={options.linkOpenNewTab}
          onChange={event => onOptionsChange({ linkOpenNewTab: event.target.checked })}
          disabled={!(options.enableLink === true)}
        >
          Open in new tab
        </Checkbox>
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Input
          label={
            <React.Fragment>
              URL template
              {/* @ts-expect-error ts-migrate(2746) FIXME: This JSX tag's 'children' prop expects a single ch... Remove this comment to see the full error message */}
              <ContextHelp
                placement="topLeft"
                arrowPointAtCenter
                // @ts-expect-error ts-migrate(2322) FIXME: Type 'Element' is not assignable to type 'null | u... Remove this comment to see the full error message
                icon={ContextHelp.defaultIcon}>
                <div>
                  Every curve can be referenced using <code>{"{{ @@x1 }} {{ @@y1 }} {{ @@x2 }} {{ @@y2 }} ..."}</code> syntax:<br/>
                  axis with any curve number according to the Series config.
                </div>
                <div>
                  The first met curve X and Y values can be referenced by just<code>{"{{ @@x }} {{ @@y }}"}</code> syntax.
                </div>
                <div>
                  Any unresolved reference would be replaced with an empty string.
                </div>
              </ContextHelp>
            </React.Fragment>
          }
          data-test="Chart.DataLabels.TextFormat"
          placeholder="(nothing)"
          defaultValue={options.linkFormat}
          onChange={(e: any) => debouncedOnOptionsChange({ linkFormat: e.target.value })}
          disabled={!(options.enableLink === true)}
        />
      </Section>
    </React.Fragment>
  );
}

GeneralSettings.propTypes = EditorPropTypes;
