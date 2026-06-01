/**
 * Feature #187 — Smart contextual tooltip unit tests.
 *
 * Locks in the behaviour callers depend on:
 *  - delta computation (previous, WoW, MoM, YoY)
 *  - graceful failure when prior point is missing / zero
 *  - sparkline SVG is well-formed and respects the trailing window
 *  - buildHovertemplate emits the customdata placeholders Plotly expects
 *  - applicability gating (chart type + datetime axis + toggle)
 */

import {
  computeDelta,
  renderSparklineSvg,
  buildHovertemplate,
  buildCustomData,
  isContextualTooltipApplicable,
} from "./contextualTooltip";

describe("contextualTooltip", () => {
  describe("computeDelta", () => {
    test("previous: compares to index-1", () => {
      const res = computeDelta([1, 2, 3, 4], [10, 20, 30, 50], 3, "previous");
      expect(res.prior).toBe(30);
      expect(res.abs).toBe(20);
      expect(res.pct).toBeCloseTo(20 / 30, 5);
    });

    test("previous: index 0 has no comparison", () => {
      const res = computeDelta([1, 2, 3], [10, 20, 30], 0, "previous");
      expect(res.prior).toBeNull();
      expect(res.abs).toBeNull();
      expect(res.pct).toBeNull();
    });

    test("previous: handles zero prior without producing Infinity", () => {
      const res = computeDelta([1, 2], [0, 10], 1, "previous");
      expect(res.prior).toBe(0);
      expect(res.abs).toBe(10);
      expect(res.pct).toBeNull();
    });

    test("WoW: snaps to point closest to (curr - 7 days)", () => {
      // 8 daily points; index 7 should compare against index 0 (~7d earlier).
      const oneDay = 24 * 60 * 60 * 1000;
      const xs: string[] = [];
      const ys: number[] = [];
      const base = Date.parse("2026-01-01T00:00:00Z");
      for (let i = 0; i < 8; i++) {
        xs.push(new Date(base + i * oneDay).toISOString());
        ys.push(100 + i);
      }
      const res = computeDelta(xs, ys, 7, "wow");
      expect(res.prior).toBe(100); // index 0
      expect(res.abs).toBe(7);
    });

    test("WoW: returns null when dataset doesn't span a full window", () => {
      const oneDay = 24 * 60 * 60 * 1000;
      const xs = [
        new Date(Date.parse("2026-01-01") + 0).toISOString(),
        new Date(Date.parse("2026-01-01") + oneDay).toISOString(),
      ];
      const ys = [100, 110];
      const res = computeDelta(xs, ys, 1, "wow");
      expect(res.prior).toBeNull();
    });

    test("auto: falls back to previous when no time anchor is available", () => {
      const res = computeDelta([null, null, null], [1, 2, 3], 2, "auto");
      // No timestamps → can't snap to a window → auto-fallback should still
      // give "previous-point" delta.
      expect(res.prior).toBe(2);
      expect(res.abs).toBe(1);
    });
  });

  describe("renderSparklineSvg", () => {
    test("returns empty string for fewer than 2 points", () => {
      expect(renderSparklineSvg([])).toBe("");
      expect(renderSparklineSvg([5])).toBe("");
    });

    test("emits <svg> with stroke matching the requested color", () => {
      const svg = renderSparklineSvg([1, 2, 3, 4], { color: "#abcdef" });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('stroke="#abcdef"');
      expect(svg.endsWith("</svg>")).toBe(true);
    });

    test("ignores NaN / Infinity points", () => {
      const svg = renderSparklineSvg([1, NaN, 3, Infinity, 5]);
      // Should still produce a sparkline from {1,3,5}
      expect(svg.startsWith("<svg")).toBe(true);
      // No 'NaN' literals leak into the path attribute.
      expect(svg).not.toContain("NaN");
    });

    test("draws a highlight dot when highlightIndex is in range", () => {
      const svg = renderSparklineSvg([1, 2, 3], { highlightIndex: 2 });
      expect(svg).toContain("<circle");
    });
  });

  describe("buildHovertemplate", () => {
    test("references customdata[0..2] and emits Plotly placeholders", () => {
      const tmpl = buildHovertemplate();
      expect(tmpl).toContain("%{customdata[0]}");
      expect(tmpl).toContain("%{customdata[1]}");
      expect(tmpl).toContain("%{customdata[2]}");
      expect(tmpl).toContain("%{x}");
      expect(tmpl).toContain("%{y}");
    });
  });

  describe("buildCustomData", () => {
    const cfg = {
      enabled: true,
      comparisonPeriod: "previous" as const,
      sparklineWindow: 4,
      seriesColor: "#2563eb",
      seriesName: "Revenue",
    };

    test("returns one tuple per data point", () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [10, 12, 15, 20, 18];
      const cd = buildCustomData(xs, ys, cfg);
      expect(cd).toHaveLength(5);
      cd.forEach(entry => {
        expect(entry).toHaveLength(3);
        expect(typeof entry[2]).toBe("string"); // series name
      });
    });

    test("first point has no delta block", () => {
      const cd = buildCustomData([1, 2, 3], [5, 7, 9], cfg);
      expect(cd[0][0]).toBe(""); // delta html empty
      expect(cd[1][0]).toContain("▲"); // 7 > 5
    });

    test("returns empty array when disabled", () => {
      const cd = buildCustomData([1, 2], [10, 20], { ...cfg, enabled: false });
      expect(cd).toHaveLength(0);
    });

    test("emits a negative-direction delta marker for a decreasing series", () => {
      const cd = buildCustomData([1, 2, 3], [10, 5, 2], cfg);
      // Index 1: 5 < 10 → ▼; index 2: 2 < 5 → ▼
      expect(cd[1][0]).toContain("▼");
      expect(cd[2][0]).toContain("▼");
    });
  });

  describe("isContextualTooltipApplicable", () => {
    test("requires the toggle, a supported chart type, AND a datetime axis", () => {
      const base = {
        contextualTooltip: { enabled: true },
        globalSeriesType: "line",
        xAxis: { type: "datetime" },
      };
      expect(isContextualTooltipApplicable(base)).toBe(true);

      expect(isContextualTooltipApplicable({ ...base, contextualTooltip: { enabled: false } })).toBe(false);
      expect(isContextualTooltipApplicable({ ...base, globalSeriesType: "pie" })).toBe(false);
      expect(isContextualTooltipApplicable({ ...base, xAxis: { type: "category" } })).toBe(false);
      expect(isContextualTooltipApplicable(null as any)).toBe(false);
    });
  });
});
