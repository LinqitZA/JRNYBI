// Feature #194: Calendar heatmap chart type (ECharts)
//
// Unit tests for the getOption builder. Verifies column auto-detection,
// year auto-detection, multi-row aggregation, visualMap min/max clamping,
// custom range mode, and rolling-12 mode.

import getOption, { CALENDAR_COLOR_SCALES } from "./getOption";

const sampleData = (rows: Array<Record<string, any>>, columns: string[]) => ({
  rows,
  columns: columns.map((c) => ({ name: c, type: "string" })),
});

describe("calendar-heatmap getOption", () => {
  // ---------------------------------------------------------------------------
  // Empty data + column-mapping fallbacks
  // ---------------------------------------------------------------------------
  test("renders a friendly empty-state title when no rows", () => {
    const opt = getOption({ rows: [], columns: [] }, {});
    expect(opt.title.text).toMatch(/pick a date column/i);
  });

  test("auto-detects date and value columns by name", () => {
    const data = sampleData(
      [
        { day: "2026-01-01", total: 5 },
        { day: "2026-01-02", total: 10 },
      ],
      ["day", "total"]
    );
    const opt = getOption(data, {});
    // Single-year mode default → 2026 since both rows are in 2026.
    expect(opt.calendar.range).toBe("2026");
    expect(opt.series[0].data).toEqual([
      ["2026-01-01", 5],
      ["2026-01-02", 10],
    ]);
  });

  // ---------------------------------------------------------------------------
  // Year mode resolution
  // ---------------------------------------------------------------------------
  test("infers single-year from the most-frequent year in the data", () => {
    const data = sampleData(
      [
        { date: "2024-06-01", value: 1 },
        { date: "2026-03-01", value: 2 },
        { date: "2026-04-01", value: 3 },
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { yearMode: "single" });
    expect(opt.calendar.range).toBe("2026"); // 2 of 3 rows in 2026
  });

  test("respects an explicit `year` option", () => {
    const data = sampleData(
      [{ date: "2025-01-01", value: 1 }],
      ["date", "value"]
    );
    const opt = getOption(data, { yearMode: "single", year: 2024 });
    expect(opt.calendar.range).toBe("2024");
  });

  test("custom range mode returns an explicit [start, end] tuple", () => {
    const data = sampleData(
      [
        { date: "2026-05-01", value: 1 },
        { date: "2026-07-15", value: 4 },
        { date: "2026-12-01", value: 9 }, // out of window — filtered
      ],
      ["date", "value"]
    );
    const opt = getOption(data, {
      yearMode: "custom",
      rangeStart: "2026-05-01",
      rangeEnd: "2026-10-31",
    });
    expect(opt.calendar.range).toEqual(["2026-05-01", "2026-10-31"]);
    // Out-of-range point is dropped from the series data.
    expect(opt.series[0].data).toEqual([
      ["2026-05-01", 1],
      ["2026-07-15", 4],
    ]);
  });

  test("custom range mode swaps start/end if user typed them backwards", () => {
    const data = sampleData(
      [{ date: "2026-06-01", value: 1 }],
      ["date", "value"]
    );
    const opt = getOption(data, {
      yearMode: "custom",
      rangeStart: "2026-12-31",
      rangeEnd: "2026-01-01",
    });
    expect(opt.calendar.range).toEqual(["2026-01-01", "2026-12-31"]);
  });

  test("rolling12 anchors to the latest data point and walks back 11 months", () => {
    const data = sampleData(
      [
        { date: "2026-08-15", value: 5 },
        { date: "2026-09-01", value: 7 }, // latest
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { yearMode: "rolling12" });
    expect(opt.calendar.range).toEqual(["2025-10-01", "2026-09-01"]);
  });

  // ---------------------------------------------------------------------------
  // Aggregation
  // ---------------------------------------------------------------------------
  test("sums multiple rows on the same date by default", () => {
    const data = sampleData(
      [
        { date: "2026-01-15", value: 1 },
        { date: "2026-01-15", value: 2 },
        { date: "2026-01-15", value: 3 },
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { year: 2026 });
    expect(opt.series[0].data).toEqual([["2026-01-15", 6]]);
  });

  test("supports avg / count / max / min aggregations", () => {
    const data = sampleData(
      [
        { date: "2026-01-01", value: 4 },
        { date: "2026-01-01", value: 8 },
      ],
      ["date", "value"]
    );
    expect(getOption(data, { year: 2026, aggregation: "avg" }).series[0].data).toEqual([
      ["2026-01-01", 6],
    ]);
    expect(getOption(data, { year: 2026, aggregation: "max" }).series[0].data).toEqual([
      ["2026-01-01", 8],
    ]);
    expect(getOption(data, { year: 2026, aggregation: "min" }).series[0].data).toEqual([
      ["2026-01-01", 4],
    ]);
    expect(getOption(data, { year: 2026, aggregation: "count" }).series[0].data).toEqual([
      ["2026-01-01", 2],
    ]);
  });

  // ---------------------------------------------------------------------------
  // visualMap min/max
  // ---------------------------------------------------------------------------
  test("clips the auto-min to zero for non-negative data", () => {
    const data = sampleData(
      [
        { date: "2026-01-01", value: 5 },
        { date: "2026-01-02", value: 10 },
        { date: "2026-01-03", value: 15 },
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { year: 2026 });
    expect(opt.visualMap.min).toBe(0);
    expect(opt.visualMap.max).toBe(15);
  });

  test("preserves a user-supplied min/max even when the data exceeds them", () => {
    const data = sampleData(
      [
        { date: "2026-01-01", value: 5 },
        { date: "2026-01-02", value: 95 },
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { year: 2026, min: 0, max: 100 });
    expect(opt.visualMap.min).toBe(0);
    expect(opt.visualMap.max).toBe(100);
  });

  test("avoids a zero-width visualMap range when all values are equal", () => {
    const data = sampleData(
      [
        { date: "2026-01-01", value: 7 },
        { date: "2026-01-02", value: 7 },
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { year: 2026 });
    expect(opt.visualMap.min).toBeLessThan(opt.visualMap.max);
  });

  // ---------------------------------------------------------------------------
  // Color scale + chrome toggles
  // ---------------------------------------------------------------------------
  test("uses the green ramp by default and honours an explicit colorScale", () => {
    const data = sampleData(
      [{ date: "2026-01-01", value: 1 }],
      ["date", "value"]
    );
    expect(getOption(data, { year: 2026 }).visualMap.inRange.color).toEqual(
      CALENDAR_COLOR_SCALES.green
    );
    expect(getOption(data, { year: 2026, colorScale: "blue" }).visualMap.inRange.color).toEqual(
      CALENDAR_COLOR_SCALES.blue
    );
    // Unknown scale name falls back to green so the viz still renders.
    expect(
      getOption(data, { year: 2026, colorScale: "lava" }).visualMap.inRange.color
    ).toEqual(CALENDAR_COLOR_SCALES.green);
  });

  test("honours showWeekdayLabels / showMonthLabels toggles", () => {
    const data = sampleData(
      [{ date: "2026-01-01", value: 1 }],
      ["date", "value"]
    );
    const opt = getOption(data, {
      year: 2026,
      showWeekdayLabels: false,
      showMonthLabels: false,
    });
    expect(opt.calendar.dayLabel.show).toBe(false);
    expect(opt.calendar.monthLabel.show).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Date parsing
  // ---------------------------------------------------------------------------
  test("normalises ISO timestamps to YYYY-MM-DD strings", () => {
    const data = sampleData(
      [
        { date: "2026-03-15T14:23:45Z", value: 4 },
        { date: new Date(Date.UTC(2026, 2, 16)), value: 7 },
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { year: 2026 });
    expect(opt.series[0].data).toEqual([
      ["2026-03-15", 4],
      ["2026-03-16", 7],
    ]);
  });

  test("skips rows with unparseable dates or non-numeric values", () => {
    const data = sampleData(
      [
        { date: "2026-01-01", value: 5 },
        { date: "garbage", value: 100 },
        { date: "2026-01-02", value: "not-a-number" },
        { date: "2026-01-03", value: 8 },
      ],
      ["date", "value"]
    );
    const opt = getOption(data, { year: 2026 });
    expect(opt.series[0].data).toEqual([
      ["2026-01-01", 5],
      ["2026-01-03", 8],
    ]);
  });
});
