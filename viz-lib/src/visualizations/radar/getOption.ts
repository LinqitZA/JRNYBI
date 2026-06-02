// Feature #197: Radar / spider chart type (ECharts)
//
// Builds an ECharts option object for a radar (spider) chart from a flat
// query result. Honours the editor settings:
//
//   - columnMapping.series + columnMapping.axes  (wide-format)
//     OR
//     columnMapping.series + columnMapping.dimension + columnMapping.value
//     (long-format)
//   - scale       — "auto" | "0-100" | "shared"
//   - shape       — "polygon" | "circle"
//   - fillOpacity — 0..1 polygon fill
//   - lineWidth   — stroke width
//   - showSymbol  — render the marker dot at each axis intersection
//   - showAxisLabels / showAxisTicks
//
// Falls back to a friendly empty-state title when the mapping isn't enough
// to render anything sensible.

import { JRNYBI_CATEGORICAL_PALETTE } from "../echarts/themes";

interface RadarSeries {
  name: string;
  values: number[];
}

interface BuiltRadar {
  indicators: { name: string; min: number; max: number }[];
  series: RadarSeries[];
}

function isNumeric(v: any): boolean {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return !Number.isNaN(n) && Number.isFinite(n);
}

function numberFormat(value: any): string {
  if (!isNumeric(value)) return "—";
  const n = Number(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Build indicator list + series data from a wide-format query result —
 * one row per series, one column per axis (the columns named in
 * `mapping.axes`). `seriesColumn` identifies each polygon.
 */
function buildWide(
  rows: any[],
  seriesColumn: string | null,
  axes: string[]
): BuiltRadar {
  const indicators = axes.map((a) => ({ name: a, min: 0, max: 0 }));
  const series: RadarSeries[] = [];

  rows.forEach((row, idx) => {
    const name =
      seriesColumn && row[seriesColumn] !== undefined && row[seriesColumn] !== null
        ? String(row[seriesColumn])
        : `Series ${idx + 1}`;
    const values = axes.map((a) => (isNumeric(row[a]) ? Number(row[a]) : 0));
    series.push({ name, values });
  });

  return { indicators, series };
}

/**
 * Build indicator list + series data from a long-format query result —
 * one row per (series, dimension, value) triple. Each unique
 * `dimensionColumn` value becomes one radar axis; each unique
 * `seriesColumn` value becomes one polygon.
 */
function buildLong(
  rows: any[],
  seriesColumn: string,
  dimensionColumn: string,
  valueColumn: string
): BuiltRadar {
  // Preserve first-seen ordering so the resulting chart is stable.
  const dimensionOrder: string[] = [];
  const seriesOrder: string[] = [];
  const dimSet = new Set<string>();
  const serSet = new Set<string>();

  rows.forEach((row) => {
    const d = row[dimensionColumn];
    const s = row[seriesColumn];
    if (d !== undefined && d !== null && !dimSet.has(String(d))) {
      dimSet.add(String(d));
      dimensionOrder.push(String(d));
    }
    if (s !== undefined && s !== null && !serSet.has(String(s))) {
      serSet.add(String(s));
      seriesOrder.push(String(s));
    }
  });

  const indicators = dimensionOrder.map((d) => ({ name: d, min: 0, max: 0 }));

  // index lookup
  const dimIndex: Record<string, number> = {};
  dimensionOrder.forEach((d, i) => (dimIndex[d] = i));

  const series: RadarSeries[] = seriesOrder.map((s) => ({
    name: s,
    values: dimensionOrder.map(() => 0),
  }));
  const serIndex: Record<string, number> = {};
  seriesOrder.forEach((s, i) => (serIndex[s] = i));

  rows.forEach((row) => {
    const s = row[seriesColumn];
    const d = row[dimensionColumn];
    const v = row[valueColumn];
    if (s === null || s === undefined || d === null || d === undefined) return;
    const si = serIndex[String(s)];
    const di = dimIndex[String(d)];
    if (si === undefined || di === undefined) return;
    series[si].values[di] = isNumeric(v) ? Number(v) : 0;
  });

  return { indicators, series };
}

function applyScale(
  built: BuiltRadar,
  scale: "auto" | "0-100" | "shared"
): BuiltRadar {
  if (built.indicators.length === 0) return built;

  if (scale === "0-100") {
    built.indicators.forEach((ind) => {
      ind.min = 0;
      ind.max = 100;
    });
    return built;
  }

  // Compute per-axis min/max.
  const axisMaxes: number[] = built.indicators.map(() => Number.NEGATIVE_INFINITY);
  const axisMins: number[] = built.indicators.map(() => Number.POSITIVE_INFINITY);
  built.series.forEach((s) => {
    s.values.forEach((v, i) => {
      if (v > axisMaxes[i]) axisMaxes[i] = v;
      if (v < axisMins[i]) axisMins[i] = v;
    });
  });

  if (scale === "shared") {
    const globalMax = Math.max(...axisMaxes.map((m) => (m === Number.NEGATIVE_INFINITY ? 0 : m)));
    const globalMin = Math.min(...axisMins.map((m) => (m === Number.POSITIVE_INFINITY ? 0 : m)));
    const padded = globalMax === globalMin ? globalMax + 1 : globalMax;
    built.indicators.forEach((ind) => {
      ind.min = Math.min(0, globalMin);
      ind.max = padded;
    });
    return built;
  }

  // scale === "auto" — per-axis bounds, padded 10% so series don't graze
  // the chart edge. Padding is scaled to the absolute magnitude of `hi`
  // (rather than the range) so the chart still breathes when all
  // observed values cluster near the maximum.
  built.indicators.forEach((ind, i) => {
    const lo = axisMins[i] === Number.POSITIVE_INFINITY ? 0 : axisMins[i];
    const hi = axisMaxes[i] === Number.NEGATIVE_INFINITY ? 1 : axisMaxes[i];
    const pad = Math.max(Math.abs(hi), Math.abs(hi - lo)) * 0.1 || 1;
    ind.min = lo < 0 ? lo - pad * 0.5 : 0;
    ind.max = hi + pad;
    if (ind.max === ind.min) ind.max = ind.min + 1;
  });
  return built;
}

export default function getOption(data: any, options: any) {
  const opts = options || {};
  const rows: any[] = (data && data.rows) || [];
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);

  const mapping = opts.columnMapping || {};

  // Resolve mapping — wide-format takes precedence when `axes` is present.
  const seriesColumn: string | null = mapping.series || null;
  const axes: string[] = Array.isArray(mapping.axes) ? mapping.axes.filter(Boolean) : [];
  const dimensionColumn: string | null = mapping.dimension || null;
  const valueColumn: string | null = mapping.value || null;

  const palette: string[] =
    Array.isArray(opts.palette) && opts.palette.length > 0
      ? opts.palette
      : JRNYBI_CATEGORICAL_PALETTE;

  // ---------------------------------------------------------------------------
  // Empty-state — when the user hasn't mapped enough columns yet, show a
  // friendly title rather than an obscure ECharts error.
  // ---------------------------------------------------------------------------
  const hasWide = axes.length >= 3;
  const hasLong = !!(seriesColumn && dimensionColumn && valueColumn);

  if (!hasWide && !hasLong) {
    return {
      title: {
        text:
          "Radar: pick a Series column and at least 3 Axis columns (or a Dimension + Value pair)",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  if (rows.length === 0) {
    return {
      title: {
        text: "Radar: query returned no rows",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Build series + indicators.
  // ---------------------------------------------------------------------------
  let built: BuiltRadar;
  try {
    if (hasWide) {
      // Filter axes to those actually present in the result.
      const validAxes = axes.filter((a) => colNames.includes(a));
      if (validAxes.length < 3) {
        return {
          title: {
            text: "Radar: at least 3 valid axis columns are required",
            left: "center",
            top: "center",
            textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
          },
        };
      }
      built = buildWide(rows, seriesColumn, validAxes);
    } else {
      built = buildLong(rows, seriesColumn as string, dimensionColumn as string, valueColumn as string);
      if (built.indicators.length < 3) {
        return {
          title: {
            text: "Radar: long-format input needs at least 3 distinct dimensions",
            left: "center",
            top: "center",
            textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
          },
        };
      }
    }
  } catch (err) {
    return {
      title: { text: "Radar: build failed", left: "center", top: "center" },
    };
  }

  const scale: "auto" | "0-100" | "shared" =
    opts.scale === "auto" || opts.scale === "shared" ? opts.scale : "0-100";
  built = applyScale(built, scale);

  const shape: "polygon" | "circle" = opts.shape === "circle" ? "circle" : "polygon";
  const fillOpacity = Math.max(
    0,
    Math.min(1, typeof opts.fillOpacity === "number" ? opts.fillOpacity : 0.25)
  );
  const lineWidth = Math.max(0, typeof opts.lineWidth === "number" ? opts.lineWidth : 2);
  const showSymbol = opts.showSymbol !== false;
  const showAxisLabels = opts.showAxisLabels !== false;
  const showAxisTicks = !!opts.showAxisTicks;

  // ---------------------------------------------------------------------------
  // Tooltip — show series name + each axis value on hover.
  // ---------------------------------------------------------------------------
  const tooltipFormatter = (info: any): string => {
    if (!info || !info.value) return "";
    const values: number[] = Array.isArray(info.value) ? info.value : [info.value];
    const lines = built.indicators
      .map((ind, i) => `<div>${ind.name}: <b>${numberFormat(values[i])}</b></div>`)
      .join("");
    const marker = info.marker || "";
    return `<div style="font-weight:600;margin-bottom:4px">${marker}${info.name || ""}</div>${lines}`;
  };

  // ---------------------------------------------------------------------------
  // Assemble the ECharts option object.
  // ---------------------------------------------------------------------------
  const seriesData = built.series.map((s, idx) => ({
    name: s.name,
    value: s.values,
    areaStyle: fillOpacity > 0 ? { opacity: fillOpacity } : undefined,
    lineStyle: { width: lineWidth },
    symbol: showSymbol ? "circle" : "none",
    symbolSize: showSymbol ? 5 : 0,
    itemStyle: { color: palette[idx % palette.length] },
  }));

  const option: any = {
    title: opts.title
      ? {
          text: opts.title,
          subtext: opts.subtitle || "",
          left: "center",
          top: 8,
        }
      : undefined,
    legend: {
      show: opts.showLegend !== false,
      bottom: 4,
      type: "scroll",
      data: built.series.map((s) => s.name),
      textStyle: { color: "#334155" },
    },
    tooltip: {
      show: opts.showTooltip !== false,
      trigger: "item",
      formatter: tooltipFormatter,
      borderColor: "#e2e8f0",
      borderWidth: 1,
      backgroundColor: "#ffffff",
      textStyle: { color: "#0f172a" },
      extraCssText: "box-shadow: 0 4px 12px rgba(15,23,42,0.10);",
    },
    color: palette,
    radar: {
      shape,
      indicator: built.indicators.map((ind) => ({
        name: ind.name,
        min: ind.min,
        max: ind.max,
      })),
      center: ["50%", opts.title ? "55%" : "50%"],
      radius: "65%",
      axisName: {
        show: showAxisLabels,
        color: "#334155",
        fontSize: 11,
      },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      splitLine: { lineStyle: { color: "#e2e8f0" } },
      splitArea: {
        show: true,
        areaStyle: {
          color: ["rgba(248,250,252,0.4)", "rgba(241,245,249,0.4)"],
        },
      },
      axisTick: { show: showAxisTicks, lineStyle: { color: "#cbd5e1" } },
      axisLabel: { show: showAxisTicks, color: "#64748b", fontSize: 10 },
    },
    series: [
      {
        type: "radar",
        data: seriesData,
        emphasis: {
          focus: "series",
          lineStyle: { width: lineWidth + 1 },
          areaStyle: fillOpacity > 0 ? { opacity: Math.min(1, fillOpacity + 0.2) } : undefined,
        },
      },
    ],
  };

  return option;
}
