import { isNil, isObject, each, forOwn, sortBy, values } from "lodash";

function addPointToSeries(point: any, seriesCollection: any, seriesName: any) {
  if (seriesCollection[seriesName] === undefined) {
    seriesCollection[seriesName] = {
      name: seriesName,
      type: "column",
      data: [],
    };
  }

  seriesCollection[seriesName].data.push(point);
}

export default function getChartData(data: any, options: any) {
  const series = {};

  const mappings = options.columnMapping;

  each(data, row => {
    let point = { $raw: row };
    let seriesName = null;
    let xValue = 0;
    const yValues = {};
    let eValue: any = null;
    let sizeValue: any = null;
    let zValue: any = null;
    let measureValue: any = null;
    let fValue: any = null;
    let fLower: any = null;
    let fUpper: any = null;
    let actualV: any = null;
    let targetV: any = null;
    let bandL: any = null;
    let bandU: any = null;

    forOwn(row, (value, definition) => {
      definition = "" + definition;
      const definitionParts = definition.split("::") || definition.split("__");
      const name = definitionParts[0];
      const type = mappings ? mappings[definition] : definitionParts[1];

      if (type === "unused") {
        return;
      }

      if (type === "x") {
        xValue = value;
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        point[type] = value;
      }
      if (type === "y") {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        yValues[name] = value;
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        point[type] = value;
      }
      if (type === "yError") {
        eValue = value;
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        point[type] = value;
      }

      if (type === "series") {
        seriesName = String(value);
      }

      if (type === "size") {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        point[type] = value;
        sizeValue = value;
      }

      if (type === "zVal") {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        point[type] = value;
        zValue = value;
      }

      // Feature #198: Waterfall — measure column ('relative'/'total'/'absolute')
      if (type === "measure") {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type
        point[type] = value;
        measureValue = value;
      }

      // Feature #200: Forecast band columns
      if (type === "forecastValue") {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type
        point[type] = value;
        fValue = value;
      }
      if (type === "forecastLower") {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type
        point[type] = value;
        fLower = value;
      }
      if (type === "forecastUpper") {
        // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type
        point[type] = value;
        fUpper = value;
      }

      // Feature #199: Bullet graph columns (actual / target / band thresholds)
      if (type === "actualValue") {
        // @ts-expect-error ts-migrate(7053)
        point[type] = value;
        actualV = value;
      }
      if (type === "targetValue") {
        // @ts-expect-error ts-migrate(7053)
        point[type] = value;
        targetV = value;
      }
      if (type === "bandLower") {
        // @ts-expect-error ts-migrate(7053)
        point[type] = value;
        bandL = value;
      }
      if (type === "bandUpper") {
        // @ts-expect-error ts-migrate(7053)
        point[type] = value;
        bandU = value;
      }

      if (type === "multiFilter" || type === "multi-filter") {
        seriesName = String(value);
      }
    });

    if (isNil(seriesName)) {
      each(yValues, (yValue, ySeriesName) => {
        // @ts-expect-error ts-migrate(2322) FIXME: Type '{ x: number; y: never; $raw: any; }' is not ... Remove this comment to see the full error message
        point = { x: xValue, y: yValue, $raw: point.$raw };
        if (eValue !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Property 'yError' does not exist on type '{ $raw: ... Remove this comment to see the full error message
          point.yError = eValue;
        }

        if (sizeValue !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Property 'size' does not exist on type '{ $raw: an... Remove this comment to see the full error message
          point.size = sizeValue;
        }

        if (zValue !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Property 'zVal' does not exist on type '{ $raw: an... Remove this comment to see the full error message
          point.zVal = zValue;
        }
        if (measureValue !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Waterfall measure column (#198)
          point.measure = measureValue;
        }
        if (fValue !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Forecast band column (#200)
          point.forecastValue = fValue;
        }
        if (fLower !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Forecast lower column (#200)
          point.forecastLower = fLower;
        }
        if (fUpper !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Forecast upper column (#200)
          point.forecastUpper = fUpper;
        }
        if (actualV !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Bullet actual (#199)
          point.actualValue = actualV;
        }
        if (targetV !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Bullet target (#199)
          point.targetValue = targetV;
        }
        if (bandL !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Bullet band lower (#199)
          point.bandLower = bandL;
        }
        if (bandU !== null) {
          // @ts-expect-error ts-migrate(2339) FIXME: Bullet band upper (#199)
          point.bandUpper = bandU;
        }
        addPointToSeries(point, series, ySeriesName);
      });
    } else {
      addPointToSeries(point, series, seriesName);
    }
  });
  return sortBy(values(series), ({ name }) => {
    if (isObject(options.seriesOptions[name])) {
      return (options.seriesOptions[name] as any).zIndex || 0;
    }
    return 0;
  });
}
