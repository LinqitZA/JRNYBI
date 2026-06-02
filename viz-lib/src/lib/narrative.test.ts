/**
 * Unit tests for the KPI narrative template engine (feature #217).
 */
import generateNarrative, { formatDeltaForNarrative } from "./narrative";

describe("narrative - generateNarrative", () => {
  test("returns empty string when current value is missing / non-finite", () => {
    expect(generateNarrative({ currentValue: null })).toBe("");
    expect(generateNarrative({ currentValue: undefined })).toBe("");
    expect(generateNarrative({ currentValue: NaN })).toBe("");
  });

  test("renders 'is N' when no delta available", () => {
    const s = generateNarrative({ metricLabel: "Revenue", currentValue: 1234 });
    expect(s).toContain("Revenue is 1,234");
  });

  test("renders direction + delta + comparison when delta is provided", () => {
    const s = generateNarrative({
      metricLabel: "Revenue",
      currentValue: 1100,
      delta: { delta: 100, pct: 0.1, direction: 1 },
      comparisonLabel: "vs prior week",
    });
    expect(s).toContain("Revenue is 1,100");
    expect(s).toContain("up +10.0%");
    expect(s).toContain("vs prior week");
  });

  test("renders 'down' for negative direction", () => {
    const s = generateNarrative({
      metricLabel: "Errors",
      currentValue: 9,
      delta: { delta: -3, pct: -0.25, direction: -1 },
      comparisonLabel: "vs yesterday",
    });
    expect(s).toContain("down -25.0%");
  });

  test("renders 'unchanged' for flat direction", () => {
    const s = generateNarrative({
      metricLabel: "Users",
      currentValue: 500,
      delta: { delta: 0, pct: 0, direction: 0 },
      comparisonLabel: "vs last week",
    });
    expect(s).toContain("unchanged");
  });

  test("threshold sentence is appended when threshold present", () => {
    const s = generateNarrative({
      metricLabel: "Temperature",
      currentValue: 36,
      delta: { delta: 2, pct: 0.06, direction: 1 },
      comparisonLabel: "vs prior hour",
      threshold: { gte: 35, color: "negative", label: "Critical high" },
    });
    expect(s).toContain("Critical high");
  });

  test("uses default 'Metric' when label missing", () => {
    const s = generateNarrative({ currentValue: 10 });
    expect(s).toContain("Metric is 10");
  });

  test("falls back to absolute delta when percentage is null", () => {
    const s = generateNarrative({
      metricLabel: "Sessions",
      currentValue: 5,
      delta: { delta: 5, pct: null, direction: 1 },
      comparisonLabel: "vs prior period",
    });
    expect(s).toContain("up +5");
  });
});

describe("narrative - formatDeltaForNarrative", () => {
  test("uses percentage when available", () => {
    expect(formatDeltaForNarrative({ delta: 1, pct: 0.05, direction: 1 })).toBe("+5.0%");
    expect(formatDeltaForNarrative({ delta: -1, pct: -0.05, direction: -1 })).toBe("-5.0%");
  });

  test("falls back to absolute number when pct is null", () => {
    expect(formatDeltaForNarrative({ delta: 12, pct: null, direction: 1 })).toBe("+12");
    expect(formatDeltaForNarrative({ delta: -3.5, pct: null, direction: -1 })).toBe("-3.5");
  });
});
