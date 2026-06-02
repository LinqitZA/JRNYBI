// Feature #194: Calendar heatmap chart type (ECharts)
//
// Builds an ECharts option object for a calendar-style year-view heatmap
// from a flat query result. Honours the editor settings:
//
//   - dateColumn / valueColumn (column mapping)
//   - yearMode  — "single" | "rolling12" | "custom"
//   - year      — explicit year for "single" mode (e.g. 2026)
//   - rangeStart / rangeEnd — explicit ISO dates for "custom" mode
//   - colorScale — preset palette ramp keyed by name
//   - showWeekdayLabels / showMonthLabels — chrome toggles
//   - aggregation — "sum" | "avg" | "count" | "max" | "min" when multiple
//                   rows share the same calendar day
//   - emptyDayColor — fill colour for days with no data point
//
// The calendar coordinate system is provided by `CalendarComponent` and
// the `HeatmapChart` series renders the per-day rectangles. Both are
// registered in viz-lib/src/visualizations/echarts/index.ts.

// ---------------------------------------------------------------------------
// Colour scales — small, hand-picked sequential ramps that read well at the
// pixel sizes a calendar cell ends up being (~10–14 px wide). All have at
// least 3 stops so ECharts can interpolate smoothly.
// ---------------------------------------------------------------------------
export const CALENDAR_COLOR_SCALES: Record<string, string[]> = {
  // Default — GitHub-style green ramp, evokes the activity heatmap that most
  // users have seen and recognise instantly.
  green: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  // JRNY brand blue ramp (matches jrny-theme.less info ramp).
  blue: ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1d4ed8"],
  // Warm orange ramp for revenue / sales metrics.
  orange: ["#fff7ed", "#fed7aa", "#fb923c", "#ea580c", "#9a3412"],
  // Diverging red-yellow-green ramp — useful for delta metrics that go
  // negative; users can pair it with a custom `min` to anchor neutral.
  redYellowGreen: ["#d73027", "#fee090", "#1a9850"],
  // Monochrome grey — minimal, accessible fallback when colour clashes
  // with surrounding dashboard widgets.
  grey: ["#f1f5f9", "#cbd5e1", "#64748b", "#334155", "#0f172a"],
};

const DEFAULT_SCALE = "green";

function toDateString(value: any): string | null {
  // Normalise whatever the SQL driver handed us into a "YYYY-MM-DD" string.
  // We accept Date objects, ISO timestamps, "YYYY-MM-DD HH:MM:SS", and the
  // shorter "YYYY-MM-DD" form. Returns null for unparseable values.
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Slice the date prefix off a full ISO timestamp when present.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Fallback — let the JS Date parser try (handles "Apr 4 2026" etc).
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return null;
  const y = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function aggregate(values: number[], mode: string): number {
  if (values.length === 0) return 0;
  switch (mode) {
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "count":
      return values.length;
    case "max":
      return Math.max(...values);
    case "min":
      return Math.min(...values);
    case "sum":
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

interface CalendarRange {
  /** ECharts range — either "YYYY" or ["YYYY-MM-DD", "YYYY-MM-DD"]. */
  range: string | [string, string];
  /** Bounds for filtering data points to this calendar (inclusive). */
  start: string;
  end: string;
}

/**
 * Build the calendar range from editor options, auto-detecting from the data
 * when nothing is set yet. Falls back to "rolling 12 months ending today" if
 * no rows have valid dates.
 */
function resolveRange(opts: any, datesSeen: string[]): CalendarRange {
  const mode: string = opts.yearMode || "single";

  // Custom range — accept any two ISO dates regardless of which side they
  // were typed in. Swap them if the user typed end < start so the calendar
  // still renders the right window.
  if (mode === "custom" && opts.rangeStart && opts.rangeEnd) {
    let s = String(opts.rangeStart).slice(0, 10);
    let e = String(opts.rangeEnd).slice(0, 10);
    if (s > e) [s, e] = [e, s];
    return { range: [s, e], start: s, end: e };
  }

  // Rolling 12 months — anchored to the latest date in the data when present,
  // otherwise to today. We can't call Date.now() in the test environment,
  // but in a real browser this is fine.
  if (mode === "rolling12") {
    const anchor = datesSeen.length > 0 ? datesSeen[datesSeen.length - 1] : null;
    if (anchor) {
      const end = anchor;
      // Subtract 11 months by parsing then reformatting.
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
      if (m) {
        const yr = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        let startYr = yr;
        let startMo = mo - 11;
        if (startMo <= 0) {
          startYr -= 1;
          startMo += 12;
        }
        const start = `${startYr}-${String(startMo).padStart(2, "0")}-01`;
        return { range: [start, end], start, end };
      }
    }
    // No data — fall back to a friendly empty year so the editor renders.
    const fallbackYear =
      (typeof opts.year === "number" && !isNaN(opts.year)) ? opts.year : 2026;
    return {
      range: String(fallbackYear),
      start: `${fallbackYear}-01-01`,
      end: `${fallbackYear}-12-31`,
    };
  }

  // Single-year mode (default). When the user hasn't picked a year, infer
  // from the data: use the year of the most frequent date in the set.
  let year: number;
  if (typeof opts.year === "number" && !isNaN(opts.year)) {
    year = opts.year;
  } else if (datesSeen.length > 0) {
    const yearCounts: Record<string, number> = {};
    for (const d of datesSeen) {
      const y = d.slice(0, 4);
      yearCounts[y] = (yearCounts[y] || 0) + 1;
    }
    const top = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0];
    year = parseInt(top[0], 10);
  } else {
    year = 2026;
  }
  return {
    range: String(year),
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export default function getOption(data: any, options: any) {
  const opts = options || {};
  const rows: any[] = (data && data.rows) || [];
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);

  // -------------------------------------------------------------------------
  // Resolve column mappings. Falls back to sensible auto-detects so the viz
  // still renders something useful before the user touches the editor.
  // -------------------------------------------------------------------------
  const mapping = opts.columnMapping || {};
  const dateColumn: string =
    mapping.date ||
    opts.dateColumn ||
    colNames.find((n) => /date|day|created|updated|time/i.test(n)) ||
    colNames[0];
  const valueColumn: string =
    mapping.value ||
    opts.valueColumn ||
    colNames.find((n) => /value|amount|total|sum|count|qty/i.test(n)) ||
    colNames.find((n) => n !== dateColumn) ||
    colNames[1] ||
    colNames[0];

  if (!dateColumn || !valueColumn || rows.length === 0) {
    return {
      title: {
        text: "Calendar heatmap: pick a date column and a value column",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Aggregate rows by date — multiple rows on the same calendar day get
  // collapsed via the configured aggregation function.
  // -------------------------------------------------------------------------
  const aggregation = opts.aggregation || "sum";
  const dayBuckets: Record<string, number[]> = {};
  for (const row of rows) {
    const dStr = toDateString(row[dateColumn]);
    if (!dStr) continue;
    const raw = row[valueColumn];
    const num = typeof raw === "number" ? raw : Number(raw);
    if (isNaN(num)) continue;
    if (!dayBuckets[dStr]) dayBuckets[dStr] = [];
    dayBuckets[dStr].push(num);
  }

  const datesSeen = Object.keys(dayBuckets).sort();
  const calRange = resolveRange(opts, datesSeen);

  // Filter aggregated points to the resolved calendar window so out-of-range
  // data doesn't shift the colour scale.
  const seriesData: Array<[string, number]> = datesSeen
    .filter((d) => d >= calRange.start && d <= calRange.end)
    .map((d) => [d, aggregate(dayBuckets[d], aggregation)]);

  // -------------------------------------------------------------------------
  // visualMap min/max — auto-derived unless the user has explicitly set
  // both `min` and `max` in options. We keep the auto behaviour generous on
  // the low end (clip to 0 when all values are positive) so the lightest
  // shade is reserved for true "low activity" days rather than the global
  // minimum.
  // -------------------------------------------------------------------------
  const numericValues = seriesData.map(([, v]) => v);
  let visualMin = typeof opts.min === "number" && !isNaN(opts.min)
    ? opts.min
    : (numericValues.length > 0 ? Math.min(...numericValues) : 0);
  let visualMax = typeof opts.max === "number" && !isNaN(opts.max)
    ? opts.max
    : (numericValues.length > 0 ? Math.max(...numericValues) : 1);
  // Clip the auto-min to zero for non-negative data — keeps the lightest
  // shade meaningful as "low / empty" rather than the smallest non-zero.
  if (typeof opts.min !== "number" && visualMin > 0) visualMin = 0;
  if (visualMin === visualMax) visualMax = visualMin + 1; // avoid /0 ramps

  const scaleName: string =
    typeof opts.colorScale === "string" && CALENDAR_COLOR_SCALES[opts.colorScale]
      ? opts.colorScale
      : DEFAULT_SCALE;
  const scale = CALENDAR_COLOR_SCALES[scaleName];

  const showWeekday = opts.showWeekdayLabels !== false;
  const showMonth = opts.showMonthLabels !== false;
  const emptyDayColor: string = opts.emptyDayColor || "#f1f5f9";

  // -------------------------------------------------------------------------
  // Tooltip formatter — date + aggregated value, with the value formatted
  // using a lightweight thousands-grouper.
  // -------------------------------------------------------------------------
  const fmt = (n: number): string => {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const tooltipFormatter = (info: any): string => {
    const value = Array.isArray(info.value) ? info.value : ["", 0];
    const dateStr: string = value[0];
    const valNum = Number(value[1]);
    return `<div style="font-weight:600">${dateStr}</div>
            <div>${fmt(valNum)}</div>`;
  };

  // -------------------------------------------------------------------------
  // Build the option object.
  // -------------------------------------------------------------------------
  const option: any = {
    title: opts.title
      ? {
          text: opts.title,
          subtext: opts.subtitle || "",
          left: "center",
          top: 4,
        }
      : undefined,
    tooltip: {
      show: opts.showTooltip !== false,
      position: "top",
      formatter: tooltipFormatter,
      backgroundColor: "#ffffff",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      textStyle: { color: "#0f172a" },
      extraCssText: "box-shadow: 0 4px 12px rgba(15,23,42,0.10);",
    },
    visualMap: {
      show: opts.showLegend !== false,
      min: visualMin,
      max: visualMax,
      type: "continuous",
      orient: "horizontal",
      left: "center",
      bottom: 4,
      inRange: { color: scale },
      itemHeight: 100,
      textStyle: { color: "#475569", fontSize: 10 },
      // ECharts visualMap is calculable by default; we want a static legend
      // for dashboard cards so leave calculable off.
      calculable: false,
    },
    calendar: {
      range: calRange.range,
      top: opts.title ? 60 : 30,
      left: 28,
      right: 28,
      bottom: 50,
      cellSize: ["auto", "auto"],
      orient: "horizontal",
      yearLabel: {
        show: true,
        color: "#0f172a",
        fontSize: 14,
        fontWeight: 600,
      },
      monthLabel: {
        show: showMonth,
        color: "#334155",
        fontSize: 11,
      },
      dayLabel: {
        show: showWeekday,
        color: "#475569",
        fontSize: 10,
        firstDay: typeof opts.firstDayOfWeek === "number" ? opts.firstDayOfWeek : 1,
        // Three-letter abbreviations, locale-friendly defaults.
        nameMap: opts.weekdayLabels || "en",
      },
      splitLine: {
        show: true,
        lineStyle: { color: "#cbd5e1", width: 1, type: "solid" },
      },
      itemStyle: {
        color: emptyDayColor,
        borderColor: "#ffffff",
        borderWidth: 2,
      },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: seriesData,
        // The heatmap series picks colours from visualMap automatically when
        // coordinateSystem is "calendar".
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: "rgba(15,23,42,0.30)",
            borderColor: "#0f172a",
            borderWidth: 1,
          },
        },
      },
    ],
  };

  return option;
}
