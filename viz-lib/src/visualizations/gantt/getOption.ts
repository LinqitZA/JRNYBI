// Feature #195: Gantt chart type (ECharts custom series)
//
// Builds an ECharts option object for a Gantt timeline from a flat query
// result. Each row is rendered as a horizontal rectangle on a
// (categoryAxis × timeAxis) plane via an ECharts custom-series renderItem.
//
// Honoured editor settings:
//   - taskColumn / startColumn / endColumn (column mapping — required)
//   - statusColumn / progressColumn (optional)
//   - statusColors    — { [statusLabel]: "#hex" } map
//   - sortOrder       — "start" | "end" | "task" | "duration" | "asAdded"
//   - showTodayLine   — vertical line at "today" (configurable date)
//   - todayDate       — ISO date the today-line snaps to (null = real now,
//                       which the renderer reads via the runtime — but
//                       we accept an explicit anchor so tests are stable)
//   - showProgressBar — overlay an inset progress rectangle from
//                       0 → progress% of the bar's width
//   - barHeight       — px height of each task rectangle (default 18)
//   - tooltipFormat   — custom template; see DEFAULT_TOOLTIP_FORMAT
//
// The custom series + dataZoom + tooltip configuration here intentionally
// mirrors the patterns shown in the official ECharts Gantt-style examples.

import { JRNYBI_CATEGORICAL_PALETTE } from "../echarts/themes";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_TOOLTIP_FORMAT = "{task} · {start} → {end} · {duration}d";

// ---------------------------------------------------------------------------
// Date utilities — accept Date | ISO timestamp | "YYYY-MM-DD" strings.
// Returns epoch milliseconds, or null when unparseable.
// ---------------------------------------------------------------------------
function parseDateMs(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return isNaN(t) ? null : t;
  }
  const str = String(value).trim();
  // Anchor "YYYY-MM-DD" at UTC midnight so durations come out as whole days.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return Date.UTC(
      parseInt(str.slice(0, 4), 10),
      parseInt(str.slice(5, 7), 10) - 1,
      parseInt(str.slice(8, 10), 10)
    );
  }
  const t = new Date(str).getTime();
  return isNaN(t) ? null : t;
}

function msToDateString(ms: number): string {
  if (ms === null || ms === undefined || isNaN(ms)) return "";
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function clampProgress(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (isNaN(n)) return null;
  // Accept either 0-1 or 0-100; auto-detect by magnitude.
  const scaled = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, scaled));
}

interface TaskRow {
  task: string;
  startMs: number;
  endMs: number;
  status: string | null;
  color: string | null;
  progress: number | null;
  raw: Record<string, any>;
}

function sortTasks(tasks: TaskRow[], sortOrder: string): TaskRow[] {
  // Stable-sort the rows so equal keys preserve query order.
  const copy = tasks.map((t, i) => ({ t, i }));
  const compareBy = (key: (row: TaskRow) => any) => (a: { t: TaskRow; i: number }, b: { t: TaskRow; i: number }) => {
    const av = key(a.t);
    const bv = key(b.t);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return a.i - b.i;
  };
  switch (sortOrder) {
    case "end":
      return copy.sort(compareBy((r) => r.endMs)).map((x) => x.t);
    case "task":
      return copy.sort(compareBy((r) => r.task.toLowerCase())).map((x) => x.t);
    case "duration":
      return copy.sort(compareBy((r) => -(r.endMs - r.startMs))).map((x) => x.t);
    case "asAdded":
      return tasks.slice();
    case "start":
    default:
      return copy.sort(compareBy((r) => r.startMs)).map((x) => x.t);
  }
}

// ---------------------------------------------------------------------------
// Status-colour resolver. A user-supplied statusColors map wins; otherwise
// we cycle through the JRNYBI categorical palette so each distinct status
// gets a stable, distinguishable colour.
// ---------------------------------------------------------------------------
function buildStatusColorFn(opts: any, statusValues: string[]): (status: string | null) => string {
  const explicit: Record<string, string> = (opts.statusColors && typeof opts.statusColors === "object")
    ? opts.statusColors
    : {};
  const palette: string[] =
    Array.isArray(opts.palette) && opts.palette.length > 0
      ? opts.palette
      : JRNYBI_CATEGORICAL_PALETTE;
  const fallback: Record<string, string> = {};
  const distinct = Array.from(new Set(statusValues.filter((s) => s !== null && s !== undefined && s !== "")));
  distinct.forEach((s, idx) => {
    fallback[s] = palette[idx % palette.length];
  });
  return (status: string | null) => {
    if (status === null || status === undefined || status === "") return palette[0];
    if (explicit[status]) return explicit[status];
    return fallback[status] || palette[0];
  };
}

export default function getOption(data: any, options: any) {
  const opts = options || {};
  const rows: any[] = (data && data.rows) || [];
  const columns: any[] = (data && data.columns) || [];
  const colNames: string[] = columns.map((c: any) => c.name).filter(Boolean);

  // -------------------------------------------------------------------------
  // Resolve column mappings with sensible auto-detection so the viz renders
  // something useful before the user has touched the editor.
  // -------------------------------------------------------------------------
  const mapping = opts.columnMapping || {};
  const taskColumn: string =
    mapping.task ||
    opts.taskColumn ||
    colNames.find((n) => /task|name|category|project|order|po/i.test(n)) ||
    colNames[0];
  const startColumn: string =
    mapping.start ||
    opts.startColumn ||
    colNames.find((n) => /start|begin|from/i.test(n)) ||
    colNames[1];
  const endColumn: string =
    mapping.end ||
    opts.endColumn ||
    colNames.find((n) => /end|finish|to|due/i.test(n)) ||
    colNames[2];
  const statusColumn: string | null =
    mapping.status ||
    opts.statusColumn ||
    colNames.find((n) => /status|state|phase/i.test(n)) ||
    null;
  const progressColumn: string | null =
    mapping.progress ||
    opts.progressColumn ||
    colNames.find((n) => /progress|pct|percent|completion/i.test(n)) ||
    null;

  if (rows.length === 0 || !taskColumn || !startColumn || !endColumn) {
    return {
      title: {
        text: "Gantt: pick task / start / end columns",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Build the row dataset, dropping rows with unparseable dates.
  // -------------------------------------------------------------------------
  const tasks: TaskRow[] = [];
  for (const row of rows) {
    const task = row[taskColumn];
    if (task === null || task === undefined || task === "") continue;
    const startMs = parseDateMs(row[startColumn]);
    let endMs = parseDateMs(row[endColumn]);
    if (startMs === null || endMs === null) continue;
    // Zero-length tasks (start == end) get a 1-day padding so they're visible.
    if (endMs < startMs) {
      const tmp = endMs;
      endMs = startMs;
      tasks.push({
        task: String(task),
        startMs: tmp,
        endMs,
        status: statusColumn ? (row[statusColumn] !== undefined && row[statusColumn] !== null ? String(row[statusColumn]) : null) : null,
        color: row.__color || null,
        progress: progressColumn ? clampProgress(row[progressColumn]) : null,
        raw: row,
      });
      continue;
    }
    if (endMs === startMs) endMs = startMs + MS_PER_DAY;
    tasks.push({
      task: String(task),
      startMs,
      endMs,
      status: statusColumn ? (row[statusColumn] !== undefined && row[statusColumn] !== null ? String(row[statusColumn]) : null) : null,
      color: row.__color || null,
      progress: progressColumn ? clampProgress(row[progressColumn]) : null,
      raw: row,
    });
  }

  if (tasks.length === 0) {
    return {
      title: {
        text: "Gantt: no rows with valid start/end dates",
        left: "center",
        top: "center",
        textStyle: { fontSize: 12, fontWeight: "normal", color: "#475569" },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Sort + assemble the category axis. Unique task names become the y-axis
  // categories; duplicates collapse to a single row (multiple bars on the
  // same lane are supported).
  // -------------------------------------------------------------------------
  const sorted = sortTasks(tasks, opts.sortOrder || "start");
  const categories: string[] = [];
  const taskIndex: Record<string, number> = {};
  for (const t of sorted) {
    if (!(t.task in taskIndex)) {
      taskIndex[t.task] = categories.length;
      categories.push(t.task);
    }
  }

  const colorFn = buildStatusColorFn(opts, tasks.map((t) => t.status ?? ""));
  const barHeight: number = Math.max(6, Math.min(48, Number(opts.barHeight) || 18));

  // Each data point: [categoryIndex, startMs, endMs, task, status, progress, durationDays]
  const seriesData = sorted.map((t) => [
    taskIndex[t.task],
    t.startMs,
    t.endMs,
    t.task,
    t.status,
    t.progress,
    Math.round((t.endMs - t.startMs) / MS_PER_DAY),
  ]);

  // -------------------------------------------------------------------------
  // Tooltip — supports a {token}-based template; defaults to a compact
  // single-line summary listing duration in days.
  // -------------------------------------------------------------------------
  const tooltipFormat: string = (typeof opts.tooltipFormat === "string" && opts.tooltipFormat.trim())
    ? opts.tooltipFormat
    : DEFAULT_TOOLTIP_FORMAT;

  const tooltipFormatter = (info: any): string => {
    if (!info || !Array.isArray(info.value)) return "";
    const [, startMs, endMs, task, status, progress, durationDays] = info.value;
    const startStr = msToDateString(startMs);
    const endStr = msToDateString(endMs);
    const progressStr = progress === null ? "—" : `${Math.round(progress * 100)}%`;
    const text = tooltipFormat
      .replace(/\{task\}/g, task || "")
      .replace(/\{start\}/g, startStr)
      .replace(/\{end\}/g, endStr)
      .replace(/\{status\}/g, status || "—")
      .replace(/\{progress\}/g, progressStr)
      .replace(/\{duration\}/g, String(durationDays));
    return `<div style="font-weight:600">${task || ""}</div>
            <div>${text}</div>
            ${status ? `<div style="color:#475569">Status: ${status}</div>` : ""}
            ${progress !== null ? `<div style="color:#475569">Progress: ${progressStr}</div>` : ""}`;
  };

  // -------------------------------------------------------------------------
  // Today line — vertical markLine drawn at the configured "today" date.
  // todayDate may be:
  //   - an explicit YYYY-MM-DD string (deterministic — good for snapshots)
  //   - null / undefined → fall back to now() at render time. To keep this
  //     function pure we capture it from a passed `nowMs` option when the
  //     caller supplied it; otherwise we omit the marker line and let the
  //     wrapping renderer inject it. The Renderer wrapper sets nowMs via
  //     options before calling getOption.
  // -------------------------------------------------------------------------
  const todayLineEnabled: boolean = opts.showTodayLine !== false;
  let todayMs: number | null = null;
  if (todayLineEnabled) {
    if (typeof opts.todayDate === "string" && opts.todayDate) {
      todayMs = parseDateMs(opts.todayDate);
    } else if (typeof opts.nowMs === "number") {
      todayMs = opts.nowMs;
    }
  }

  // -------------------------------------------------------------------------
  // Custom-series renderItem — draws a rectangle for the task bar plus an
  // optional inset progress rectangle.
  // -------------------------------------------------------------------------
  const showProgressBar: boolean = opts.showProgressBar !== false;
  const renderItem = (params: any, api: any) => {
    const categoryIndex = api.value(0);
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const status = api.value(4);
    const progress = api.value(5);
    const heightPx = barHeight;
    const width = Math.max(1, end[0] - start[0]);
    const fill = colorFn(status);
    const rect: any = {
      type: "rect",
      transition: ["shape"],
      shape: {
        x: start[0],
        y: start[1] - heightPx / 2,
        width,
        height: heightPx,
        r: 2,
      },
      style: {
        fill,
        stroke: "rgba(15,23,42,0.10)",
        lineWidth: 1,
      },
    };
    // Clip to coordinate-system bounds — prevents the rectangle from
    // bleeding outside the plot when the user dataZooms in.
    const coordSys = params.coordSys;
    const clipped: any = {
      type: "group",
      children: [
        {
          ...rect,
          clipPath: {
            type: "rect",
            shape: {
              x: coordSys.x,
              y: coordSys.y,
              width: coordSys.width,
              height: coordSys.height,
            },
          },
        },
      ],
    };
    if (showProgressBar && progress !== null && progress !== undefined && progress > 0) {
      clipped.children.push({
        type: "rect",
        shape: {
          x: start[0],
          y: start[1] - heightPx / 2 + heightPx * 0.65,
          width: Math.max(1, width * progress),
          height: heightPx * 0.25,
          r: 1,
        },
        style: {
          fill: "rgba(15,23,42,0.45)",
        },
      });
    }
    return clipped;
  };

  // -------------------------------------------------------------------------
  // Build the option object.
  // -------------------------------------------------------------------------
  const option: any = {
    title: opts.title
      ? { text: opts.title, subtext: opts.subtitle || "", left: "center", top: 4 }
      : undefined,
    tooltip: {
      show: opts.showTooltip !== false,
      formatter: tooltipFormatter,
      backgroundColor: "#ffffff",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      textStyle: { color: "#0f172a" },
      extraCssText: "box-shadow: 0 4px 12px rgba(15,23,42,0.10);",
    },
    grid: {
      left: 120,
      right: 30,
      top: opts.title ? 60 : 30,
      bottom: 60,
      containLabel: false,
    },
    xAxis: {
      type: "time",
      axisLabel: { color: "#475569", fontSize: 11 },
      splitLine: { lineStyle: { color: "#e2e8f0" } },
      // Padding 5% so the leftmost / rightmost bars don't sit flush against
      // the y-axis baseline.
      min: (val: any) => val.min - (val.max - val.min) * 0.02,
      max: (val: any) => val.max + (val.max - val.min) * 0.02,
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      axisLabel: { color: "#0f172a", fontSize: 11, fontWeight: 500 },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisTick: { show: false },
    },
    dataZoom: [
      {
        type: "slider",
        xAxisIndex: 0,
        height: 16,
        bottom: 26,
        backgroundColor: "#f8fafc",
        fillerColor: "rgba(37,99,235,0.10)",
        handleSize: "100%",
        handleStyle: { color: "#2563eb" },
        textStyle: { color: "#475569", fontSize: 10 },
      },
      { type: "inside", xAxisIndex: 0 },
    ],
    series: [
      {
        name: opts.title || "Gantt",
        type: "custom",
        encode: { x: [1, 2], y: 0 },
        renderItem,
        data: seriesData,
        // The custom series doesn't drive the legend; suppress the entry.
        legendHoverLink: false,
      },
    ],
  };

  // Inject the today-line as a marker on the time axis.
  if (todayMs !== null) {
    option.series[0].markLine = {
      symbol: ["none", "none"],
      silent: true,
      label: {
        show: true,
        formatter: "Today",
        color: "#dc2626",
        fontSize: 10,
        position: "insideEndTop",
      },
      lineStyle: { color: "#dc2626", width: 1, type: "dashed" },
      data: [{ xAxis: todayMs }],
    };
  }

  return option;
}
