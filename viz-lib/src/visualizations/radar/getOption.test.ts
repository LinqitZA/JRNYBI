// Feature #197: Radar / spider chart type (ECharts)
//
// Unit tests for the getOption builder. Verifies the two mapping modes
// (wide-format and long-format), the three axis-scale modes, and the
// empty-state fallbacks.

import getOption from "./getOption";

const sampleData = (rows: Array<Record<string, any>>, columns: string[]) => ({
  rows,
  columns: columns.map((c) => ({ name: c, type: "string" })),
});

describe("radar getOption", () => {
  // ---------------------------------------------------------------------------
  // Empty / under-specified column mapping
  // ---------------------------------------------------------------------------
  test("shows a friendly empty-state when no mapping is provided", () => {
    const opt = getOption({ rows: [], columns: [] }, {});
    expect(opt.title.text).toMatch(/pick a Series column/i);
  });

  test("shows an empty-state when fewer than 3 wide-format axes are mapped", () => {
    const data = sampleData(
      [{ supplier: "Acme", a: 80, b: 90 }],
      ["supplier", "a", "b"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "supplier", axes: ["a", "b"] },
    });
    expect(opt.title.text).toMatch(/pick a Series column/i);
  });

  test("shows an empty-state when long-format yields fewer than 3 dimensions", () => {
    const data = sampleData(
      [
        { supplier: "Acme", dim: "OTIF", score: 80 },
        { supplier: "Acme", dim: "Quality", score: 90 },
      ],
      ["supplier", "dim", "score"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "supplier", dimension: "dim", value: "score" },
    });
    expect(opt.title.text).toMatch(/at least 3/i);
  });

  test("shows a friendly empty-state when query returns zero rows", () => {
    const opt = getOption(
      { rows: [], columns: [{ name: "supplier" }, { name: "a" }, { name: "b" }, { name: "c" }] },
      { columnMapping: { series: "supplier", axes: ["a", "b", "c"] } }
    );
    expect(opt.title.text).toMatch(/no rows/i);
  });

  // ---------------------------------------------------------------------------
  // Wide-format input
  // ---------------------------------------------------------------------------
  test("builds wide-format radar with one polygon per row, axes from columns", () => {
    const data = sampleData(
      [
        { supplier_name: "Acme", otif: 85, quality: 92, delivery: 78, price: 80 },
        { supplier_name: "Globex", otif: 70, quality: 85, delivery: 90, price: 72 },
      ],
      ["supplier_name", "otif", "quality", "delivery", "price"]
    );
    const opt = getOption(data, {
      columnMapping: {
        series: "supplier_name",
        axes: ["otif", "quality", "delivery", "price"],
      },
    });
    expect(opt.radar.indicator.map((i: any) => i.name)).toEqual([
      "otif",
      "quality",
      "delivery",
      "price",
    ]);
    expect(opt.series[0].data).toHaveLength(2);
    expect(opt.series[0].data[0].name).toBe("Acme");
    expect(opt.series[0].data[0].value).toEqual([85, 92, 78, 80]);
    expect(opt.series[0].data[1].name).toBe("Globex");
    expect(opt.series[0].data[1].value).toEqual([70, 85, 90, 72]);
  });

  // ---------------------------------------------------------------------------
  // Long-format input
  // ---------------------------------------------------------------------------
  test("builds long-format radar by pivoting (series, dimension, value) triples", () => {
    const data = sampleData(
      [
        { supplier: "Acme", dim: "OTIF", score: 80 },
        { supplier: "Acme", dim: "Quality", score: 90 },
        { supplier: "Acme", dim: "Delivery", score: 75 },
        { supplier: "Globex", dim: "OTIF", score: 70 },
        { supplier: "Globex", dim: "Quality", score: 88 },
        { supplier: "Globex", dim: "Delivery", score: 95 },
      ],
      ["supplier", "dim", "score"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "supplier", dimension: "dim", value: "score" },
    });

    expect(opt.radar.indicator.map((i: any) => i.name)).toEqual([
      "OTIF",
      "Quality",
      "Delivery",
    ]);
    expect(opt.series[0].data).toHaveLength(2);
    expect(opt.series[0].data[0]).toMatchObject({ name: "Acme", value: [80, 90, 75] });
    expect(opt.series[0].data[1]).toMatchObject({ name: "Globex", value: [70, 88, 95] });
  });

  test("missing (series, dimension) cells default to 0", () => {
    const data = sampleData(
      [
        { supplier: "Acme", dim: "OTIF", score: 80 },
        { supplier: "Acme", dim: "Quality", score: 90 },
        { supplier: "Acme", dim: "Delivery", score: 75 },
        { supplier: "Globex", dim: "OTIF", score: 70 },
        // Globex missing Quality and Delivery
      ],
      ["supplier", "dim", "score"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "supplier", dimension: "dim", value: "score" },
    });
    expect(opt.series[0].data[1]).toMatchObject({ name: "Globex", value: [70, 0, 0] });
  });

  // ---------------------------------------------------------------------------
  // Axis scaling
  // ---------------------------------------------------------------------------
  test("default 0-100 scale applies to all indicators", () => {
    const data = sampleData(
      [{ s: "X", a: 10, b: 20, c: 30 }],
      ["s", "a", "b", "c"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b", "c"] },
    });
    expect(opt.radar.indicator).toEqual([
      { name: "a", min: 0, max: 100 },
      { name: "b", min: 0, max: 100 },
      { name: "c", min: 0, max: 100 },
    ]);
  });

  test("shared scale picks a single global [min, max] across all axes", () => {
    const data = sampleData(
      [
        { s: "X", a: 1, b: 5, c: 50 },
        { s: "Y", a: 2, b: 10, c: 90 },
      ],
      ["s", "a", "b", "c"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b", "c"] },
      scale: "shared",
    });
    // All axes share the same min (0 or below) and max (90).
    const maxes = new Set(opt.radar.indicator.map((i: any) => i.max));
    expect(maxes.size).toBe(1);
    expect(Array.from(maxes)[0]).toBe(90);
  });

  test("auto scale computes per-axis bounds with padding", () => {
    const data = sampleData(
      [
        { s: "X", a: 100, b: 5 },
        { s: "Y", a: 200, b: 10 },
        { s: "Z", a: 300, b: 15 },
      ],
      ["s", "a", "b"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b"] },
      scale: "auto",
    });
    // Per-axis: axis "a" range [0, 300+10%], axis "b" range [0, 15+10%].
    expect(opt.radar.indicator[0].min).toBe(0);
    expect(opt.radar.indicator[0].max).toBeCloseTo(330, 1);
    expect(opt.radar.indicator[1].min).toBe(0);
    expect(opt.radar.indicator[1].max).toBeCloseTo(16.5, 1);
  });

  // ---------------------------------------------------------------------------
  // Visual knobs
  // ---------------------------------------------------------------------------
  test("shape circle / polygon flows into radar.shape", () => {
    const data = sampleData(
      [{ s: "X", a: 1, b: 2, c: 3 }],
      ["s", "a", "b", "c"]
    );
    const polygonOpt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b", "c"] },
      shape: "polygon",
    });
    const circleOpt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b", "c"] },
      shape: "circle",
    });
    expect(polygonOpt.radar.shape).toBe("polygon");
    expect(circleOpt.radar.shape).toBe("circle");
  });

  test("fillOpacity 0 disables the area fill", () => {
    const data = sampleData(
      [{ s: "X", a: 1, b: 2, c: 3 }],
      ["s", "a", "b", "c"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b", "c"] },
      fillOpacity: 0,
    });
    expect(opt.series[0].data[0].areaStyle).toBeUndefined();
  });

  test("fillOpacity > 0 emits an areaStyle.opacity on each polygon", () => {
    const data = sampleData(
      [{ s: "X", a: 1, b: 2, c: 3 }],
      ["s", "a", "b", "c"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b", "c"] },
      fillOpacity: 0.5,
    });
    expect(opt.series[0].data[0].areaStyle).toEqual({ opacity: 0.5 });
  });

  test("multiple series (e.g. Last Year vs This Year) produce multiple overlaid polygons", () => {
    const data = sampleData(
      [
        { period: "Last Year", a: 60, b: 70, c: 80 },
        { period: "This Year", a: 75, b: 85, c: 88 },
      ],
      ["period", "a", "b", "c"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "period", axes: ["a", "b", "c"] },
    });
    expect(opt.series[0].data.map((d: any) => d.name)).toEqual([
      "Last Year",
      "This Year",
    ]);
    expect(opt.legend.data).toEqual(["Last Year", "This Year"]);
  });

  // ---------------------------------------------------------------------------
  // Robustness
  // ---------------------------------------------------------------------------
  test("non-numeric axis values coerce to 0", () => {
    const data = sampleData(
      [{ s: "X", a: "n/a", b: null, c: "5" }],
      ["s", "a", "b", "c"]
    );
    const opt = getOption(data, {
      columnMapping: { series: "s", axes: ["a", "b", "c"] },
    });
    expect(opt.series[0].data[0].value).toEqual([0, 0, 5]);
  });

  test("missing series column falls back to 'Series N' labels", () => {
    const data = sampleData(
      [
        { a: 10, b: 20, c: 30 },
        { a: 40, b: 50, c: 60 },
      ],
      ["a", "b", "c"]
    );
    const opt = getOption(data, {
      columnMapping: { series: null, axes: ["a", "b", "c"] },
    });
    expect(opt.series[0].data.map((d: any) => d.name)).toEqual([
      "Series 1",
      "Series 2",
    ]);
  });
});
