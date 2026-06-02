/**
 * Unit tests for the KPI Card v2 helpers (feature #192).
 * The legacy utils.test.ts still covers getCounterData() unchanged.
 */
import {
  computeDelta,
  extractSparklineSeries,
  computeComparisonValue,
  pickThreshold,
  resolveDeltaColor,
  formatDeltaValue,
  formatDeltaPct,
  defaultComparisonLabel,
  getCounterV2Data,
} from "./utils";
import getOptions, { isV2Enabled } from "./getOptions";

describe("Counter v2 - computeDelta", () => {
  test("returns null when either side is missing", () => {
    expect(computeDelta(null, 5)).toBeNull();
    expect(computeDelta(5, null)).toBeNull();
    expect(computeDelta(undefined as any, 5)).toBeNull();
    expect(computeDelta(NaN, 5)).toBeNull();
  });

  test("positive delta with percentage", () => {
    const r = computeDelta(110, 100);
    expect(r).not.toBeNull();
    expect(r!.delta).toBe(10);
    expect(r!.pct).toBeCloseTo(0.1);
    expect(r!.direction).toBe(1);
  });

  test("negative delta", () => {
    const r = computeDelta(80, 100);
    expect(r!.delta).toBe(-20);
    expect(r!.pct).toBeCloseTo(-0.2);
    expect(r!.direction).toBe(-1);
  });

  test("zero compared value returns null pct (no Infinity)", () => {
    const r = computeDelta(5, 0);
    expect(r!.delta).toBe(5);
    expect(r!.pct).toBeNull();
    expect(r!.direction).toBe(1);
  });

  test("flat (zero) delta", () => {
    const r = computeDelta(50, 50);
    expect(r!.direction).toBe(0);
    expect(r!.delta).toBe(0);
  });
});

describe("Counter v2 - extractSparklineSeries", () => {
  test("returns empty for missing column / empty rows", () => {
    expect(extractSparklineSeries([], "v")).toEqual([]);
    expect(extractSparklineSeries(null as any, "v")).toEqual([]);
    expect(extractSparklineSeries([{ v: 1 }], undefined)).toEqual([]);
  });

  test("preserves row order when no date column", () => {
    const rows = [{ v: 3 }, { v: 1 }, { v: 2 }];
    expect(extractSparklineSeries(rows, "v")).toEqual([3, 1, 2]);
  });

  test("sorts ascending by date column when provided", () => {
    const rows = [
      { v: 3, t: "2024-03" },
      { v: 1, t: "2024-01" },
      { v: 2, t: "2024-02" },
    ];
    expect(extractSparklineSeries(rows, "v", "t")).toEqual([1, 2, 3]);
  });

  test("drops non-finite values", () => {
    const rows = [{ v: 1 }, { v: null }, { v: NaN }, { v: "abc" }, { v: 5 }];
    expect(extractSparklineSeries(rows, "v")).toEqual([1, 5]);
  });
});

describe("Counter v2 - computeComparisonValue", () => {
  const monthly = Array.from({ length: 15 }, (_, i) => ({ value: 10 + i, month: `2024-${i + 1}` }));

  test("returns null when mode is none", () => {
    expect(computeComparisonValue(monthly, getOptions({ comparisonMode: "none" }), 24)).toBeNull();
  });

  test("custom-value uses options.comparisonValue", () => {
    expect(
      computeComparisonValue([], getOptions({ comparisonMode: "custom-value", comparisonValue: 42 }), 100)
    ).toBe(42);
  });

  test("previous-period picks the second-to-last point", () => {
    const opts = getOptions({ comparisonMode: "previous-period", sparklineColumn: "value", sparklineDateColumn: "month" });
    // 15 points (sorted natural); current is last (24). previous-period should
    // drop the trailing matching point and return 23.
    expect(computeComparisonValue(monthly, opts, 24)).toBe(23);
  });

  test("prior-year walks 12 steps back when series long enough", () => {
    const opts = getOptions({ comparisonMode: "prior-year", sparklineColumn: "value", sparklineDateColumn: "month" });
    // After dropping trailing point: 14 points, [10..23]. idx = 14-12 = 2 → 12.
    expect(computeComparisonValue(monthly, opts, 24)).toBe(12);
  });

  test("prior-year falls back to first sample on short series", () => {
    const short = [{ v: 5 }, { v: 10 }];
    const opts = getOptions({ comparisonMode: "prior-year", sparklineColumn: "v" });
    expect(computeComparisonValue(short, opts, 10)).toBe(5);
  });

  test("target-column reads legacy target row/col", () => {
    const rows = [{ a: 10, b: 50 }, { a: 20, b: 80 }];
    const opts = getOptions({ comparisonMode: "target-column", targetColName: "b", targetRowNumber: 2 });
    expect(computeComparisonValue(rows, opts, 20)).toBe(80);
  });
});

describe("Counter v2 - pickThreshold", () => {
  const thresholds = [
    { gte: 0, color: "negative" as const },
    { gte: 10, color: "warning" as const },
    { gte: 20, color: "positive" as const },
  ];

  test("returns null for empty / missing thresholds", () => {
    expect(pickThreshold(5, [])).toBeNull();
    expect(pickThreshold(5, undefined)).toBeNull();
    expect(pickThreshold(null, thresholds)).toBeNull();
  });

  test("picks the largest entry still <= value", () => {
    expect(pickThreshold(5, thresholds)!.color).toBe("negative");
    expect(pickThreshold(10, thresholds)!.color).toBe("warning");
    expect(pickThreshold(15, thresholds)!.color).toBe("warning");
    expect(pickThreshold(25, thresholds)!.color).toBe("positive");
  });

  test("returns null when value is below all thresholds", () => {
    expect(pickThreshold(-1, thresholds)).toBeNull();
  });
});

describe("Counter v2 - resolveDeltaColor", () => {
  test("threshold wins over delta direction", () => {
    const t = { gte: 0, color: "warning" as const };
    expect(resolveDeltaColor({ delta: 5, pct: 0.1, direction: 1 }, t)).toBe("warning");
  });

  test("delta direction picks positive/negative/neutral", () => {
    expect(resolveDeltaColor({ delta: 5, pct: 0.1, direction: 1 }, null)).toBe("positive");
    expect(resolveDeltaColor({ delta: -5, pct: -0.1, direction: -1 }, null)).toBe("negative");
    expect(resolveDeltaColor({ delta: 0, pct: 0, direction: 0 }, null)).toBe("neutral");
  });

  test("missing delta + no threshold → neutral", () => {
    expect(resolveDeltaColor(null, null)).toBe("neutral");
  });
});

describe("Counter v2 - format helpers", () => {
  test("formatDeltaValue signs the result", () => {
    expect(formatDeltaValue(10, getOptions({}))).toContain("+");
    expect(formatDeltaValue(-10, getOptions({}))).toContain("-");
    expect(formatDeltaValue(0, getOptions({}))).not.toMatch(/^[+-]/);
  });

  test("formatDeltaPct outputs a signed percentage", () => {
    expect(formatDeltaPct(0.082)).toBe("+8.2%");
    expect(formatDeltaPct(-0.15)).toBe("-15.0%");
  });

  test("defaultComparisonLabel covers all modes", () => {
    expect(defaultComparisonLabel("previous-period")).toBe("vs prior period");
    expect(defaultComparisonLabel("prior-year")).toBe("vs prior year");
    expect(defaultComparisonLabel("custom-value")).toBe("vs target");
    expect(defaultComparisonLabel("target-column")).toBe("vs target");
    expect(defaultComparisonLabel("none")).toBe("");
  });
});

describe("Counter v2 - isV2Enabled", () => {
  test("false when only legacy keys present", () => {
    expect(isV2Enabled(getOptions({ counterColName: "v", rowNumber: 1, stringDecimal: 2 }))).toBe(false);
  });

  test("true when showSparkline is set", () => {
    expect(isV2Enabled(getOptions({ showSparkline: true }))).toBe(true);
  });

  test("true when comparisonMode != none", () => {
    expect(isV2Enabled(getOptions({ comparisonMode: "previous-period" }))).toBe(true);
  });

  test("true when thresholds is non-empty", () => {
    expect(isV2Enabled(getOptions({ thresholds: [{ gte: 0, color: "positive" }] }))).toBe(true);
  });

  test("true when showNarrative set", () => {
    expect(isV2Enabled(getOptions({ showNarrative: true }))).toBe(true);
  });
});

describe("Counter v2 - getCounterV2Data integration", () => {
  test("computes value + delta + chip color + sparkline", () => {
    const rows = [
      { revenue: 100, m: "2024-01" },
      { revenue: 110, m: "2024-02" },
      { revenue: 120, m: "2024-03" },
    ];
    const opts = getOptions({
      counterColName: "revenue",
      rowNumber: -1, // last row → 120
      comparisonMode: "previous-period",
      sparklineColumn: "revenue",
      sparklineDateColumn: "m",
      showSparkline: true,
    });
    const v2 = getCounterV2Data(rows, opts, "Revenue");

    expect(v2.counterValueRaw).toBe(120);
    expect(v2.delta).not.toBeNull();
    expect(v2.delta!.direction).toBe(1);
    expect(v2.deltaColor).toBe("positive");
    expect(v2.comparisonLabel).toBe("vs prior period");
    expect(v2.sparklineSeries).toEqual([100, 110, 120]);
  });

  test("threshold color overrides delta direction", () => {
    const rows = [{ v: 50 }, { v: 30 }];
    const opts = getOptions({
      counterColName: "v",
      rowNumber: -1, // 30 (decreasing → would be negative by default)
      comparisonMode: "previous-period",
      sparklineColumn: "v",
      thresholds: [
        { gte: 0, color: "warning" },
        { gte: 100, color: "negative" },
      ],
    });
    const v2 = getCounterV2Data(rows, opts, "X");
    expect(v2.deltaColor).toBe("warning");
  });
});
