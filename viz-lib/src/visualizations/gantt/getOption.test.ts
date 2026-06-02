// Feature #195: Gantt chart type (ECharts custom series)
//
// Unit tests for the getOption builder. Verifies column auto-detection,
// sort order, status colouring, progress clamping, today-line rendering,
// duration calculation, and tooltip token expansion.

import getOption from "./getOption";

const sampleData = (rows: Array<Record<string, any>>, columns: string[]) => ({
  rows,
  columns: columns.map((c) => ({ name: c, type: "string" })),
});

describe("gantt getOption", () => {
  // ---------------------------------------------------------------------------
  // Empty + auto-detect
  // ---------------------------------------------------------------------------
  test("renders an empty-state title when no rows", () => {
    const opt = getOption({ rows: [], columns: [] }, {});
    expect(opt.title.text).toMatch(/pick task/i);
  });

  test("auto-detects task / start / end columns by name", () => {
    const data = sampleData(
      [{ task: "Build wall", start_date: "2026-01-01", end_date: "2026-01-10" }],
      ["task", "start_date", "end_date"]
    );
    const opt = getOption(data, {});
    expect(opt.yAxis.data).toEqual(["Build wall"]);
    expect(opt.series[0].data.length).toBe(1);
    // category index, startMs, endMs, taskName, status, progress, durationDays
    const point = opt.series[0].data[0];
    expect(point[0]).toBe(0); // first category
    expect(point[3]).toBe("Build wall");
    expect(point[6]).toBe(9); // 9 days from Jan 1 → Jan 10
  });

  test("auto-pads zero-length tasks to 1 day so they're visible", () => {
    const data = sampleData(
      [{ task: "Kickoff", start: "2026-02-01", end: "2026-02-01" }],
      ["task", "start", "end"]
    );
    const opt = getOption(data, {});
    const point = opt.series[0].data[0];
    expect(point[6]).toBe(1); // duration = 1 day after padding
  });

  test("drops rows with unparseable dates", () => {
    const data = sampleData(
      [
        { task: "A", start: "2026-01-01", end: "2026-01-05" },
        { task: "B", start: "garbage", end: "2026-02-01" },
        { task: "C", start: "2026-03-01", end: "not-a-date" },
      ],
      ["task", "start", "end"]
    );
    const opt = getOption(data, {});
    expect(opt.series[0].data.length).toBe(1);
    expect(opt.yAxis.data).toEqual(["A"]);
  });

  // ---------------------------------------------------------------------------
  // Sort order
  // ---------------------------------------------------------------------------
  test("sorts by start date by default", () => {
    const data = sampleData(
      [
        { task: "Z", start: "2026-03-01", end: "2026-03-10" },
        { task: "A", start: "2026-01-01", end: "2026-01-10" },
        { task: "M", start: "2026-02-01", end: "2026-02-10" },
      ],
      ["task", "start", "end"]
    );
    const opt = getOption(data, {});
    expect(opt.yAxis.data).toEqual(["A", "M", "Z"]);
  });

  test("sortOrder=task sorts alphabetically", () => {
    const data = sampleData(
      [
        { task: "Charlie", start: "2026-03-01", end: "2026-03-10" },
        { task: "alpha", start: "2026-01-01", end: "2026-01-10" },
        { task: "Bravo", start: "2026-02-01", end: "2026-02-10" },
      ],
      ["task", "start", "end"]
    );
    const opt = getOption(data, { sortOrder: "task" });
    expect(opt.yAxis.data).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  test("sortOrder=duration sorts longest first", () => {
    const data = sampleData(
      [
        { task: "Short", start: "2026-01-01", end: "2026-01-02" },
        { task: "Long", start: "2026-01-01", end: "2026-06-01" },
        { task: "Medium", start: "2026-01-01", end: "2026-02-01" },
      ],
      ["task", "start", "end"]
    );
    const opt = getOption(data, { sortOrder: "duration" });
    expect(opt.yAxis.data).toEqual(["Long", "Medium", "Short"]);
  });

  // ---------------------------------------------------------------------------
  // Status colour mapping
  // ---------------------------------------------------------------------------
  test("uses explicit statusColors for matching status values", () => {
    const data = sampleData(
      [
        { task: "T1", start: "2026-01-01", end: "2026-01-05", status: "done" },
        { task: "T2", start: "2026-02-01", end: "2026-02-05", status: "pending" },
      ],
      ["task", "start", "end", "status"]
    );
    const opt = getOption(data, {
      statusColors: { done: "#10b981", pending: "#f59e0b" },
    });
    // Stub the api the renderItem expects, then check it calls the colour map.
    const api: any = {
      value: (idx: number) => opt.series[0].data[0][idx],
      coord: () => [10, 50],
    };
    const params: any = { coordSys: { x: 0, y: 0, width: 100, height: 100 } };
    const node = opt.series[0].renderItem(params, api);
    const rect = node.children[0];
    expect(rect.style.fill).toBe("#10b981");
  });

  // ---------------------------------------------------------------------------
  // Progress clamping
  // ---------------------------------------------------------------------------
  test("normalises 0-100 progress values into 0-1", () => {
    const data = sampleData(
      [
        { task: "T1", start: "2026-01-01", end: "2026-01-10", pct: 50 },
        { task: "T2", start: "2026-02-01", end: "2026-02-10", pct: 0.25 },
      ],
      ["task", "start", "end", "pct"]
    );
    const opt = getOption(data, {
      columnMapping: { task: "task", start: "start", end: "end", progress: "pct" },
    });
    expect(opt.series[0].data[0][5]).toBe(0.5);
    expect(opt.series[0].data[1][5]).toBe(0.25);
  });

  // ---------------------------------------------------------------------------
  // Today line
  // ---------------------------------------------------------------------------
  test("attaches a today-line markLine when todayDate is set", () => {
    const data = sampleData(
      [{ task: "T1", start: "2026-01-01", end: "2026-12-31" }],
      ["task", "start", "end"]
    );
    const opt = getOption(data, {
      showTodayLine: true,
      todayDate: "2026-06-01",
    });
    expect(opt.series[0].markLine).toBeDefined();
    expect(opt.series[0].markLine.data[0].xAxis).toBe(Date.UTC(2026, 5, 1));
  });

  test("omits today-line when showTodayLine=false", () => {
    const data = sampleData(
      [{ task: "T1", start: "2026-01-01", end: "2026-12-31" }],
      ["task", "start", "end"]
    );
    const opt = getOption(data, {
      showTodayLine: false,
      todayDate: "2026-06-01",
    });
    expect(opt.series[0].markLine).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Tooltip template
  // ---------------------------------------------------------------------------
  test("expands all tooltip tokens including duration", () => {
    const data = sampleData(
      [
        {
          task: "Build wall",
          start: "2026-01-01",
          end: "2026-01-11",
          status: "in-progress",
          pct: 70,
        },
      ],
      ["task", "start", "end", "status", "pct"]
    );
    const opt = getOption(data, {
      columnMapping: { task: "task", start: "start", end: "end", status: "status", progress: "pct" },
      tooltipFormat: "{task} | {status} | {duration}d | {progress}",
    });
    const info: any = { value: opt.series[0].data[0] };
    const html = opt.tooltip.formatter(info);
    expect(html).toContain("Build wall");
    expect(html).toContain("in-progress");
    expect(html).toContain("10d");
    expect(html).toContain("70%");
  });

  // ---------------------------------------------------------------------------
  // Progress bar overlay
  // ---------------------------------------------------------------------------
  test("renderItem skips the progress overlay when showProgressBar is false", () => {
    const data = sampleData(
      [{ task: "T1", start: "2026-01-01", end: "2026-01-10", pct: 50 }],
      ["task", "start", "end", "pct"]
    );
    const opt = getOption(data, {
      columnMapping: { task: "task", start: "start", end: "end", progress: "pct" },
      showProgressBar: false,
    });
    const api: any = {
      value: (idx: number) => opt.series[0].data[0][idx],
      coord: () => [10, 50],
    };
    const params: any = { coordSys: { x: 0, y: 0, width: 100, height: 100 } };
    const node = opt.series[0].renderItem(params, api);
    // No progress rect, only the task rect (wrapped in a group).
    expect(node.children.length).toBe(1);
  });

  test("renderItem includes a progress overlay when progress > 0", () => {
    const data = sampleData(
      [{ task: "T1", start: "2026-01-01", end: "2026-01-10", pct: 50 }],
      ["task", "start", "end", "pct"]
    );
    const opt = getOption(data, {
      columnMapping: { task: "task", start: "start", end: "end", progress: "pct" },
      showProgressBar: true,
    });
    const api: any = {
      value: (idx: number) => opt.series[0].data[0][idx],
      coord: () => [10, 50],
    };
    const params: any = { coordSys: { x: 0, y: 0, width: 100, height: 100 } };
    const node = opt.series[0].renderItem(params, api);
    expect(node.children.length).toBe(2);
  });
});
