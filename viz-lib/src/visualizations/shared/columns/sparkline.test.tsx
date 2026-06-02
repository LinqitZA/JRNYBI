import { parseSparklineValues, resolveSparklineColor } from "./sparkline";

describe("Visualizations -> Table -> Columns -> Sparkline", () => {
  describe("parseSparklineValues", () => {
    it("returns [] for null / undefined / empty", () => {
      expect(parseSparklineValues(null)).toEqual([]);
      expect(parseSparklineValues(undefined)).toEqual([]);
      expect(parseSparklineValues("")).toEqual([]);
      expect(parseSparklineValues("   ")).toEqual([]);
      expect(parseSparklineValues("null")).toEqual([]);
      expect(parseSparklineValues("NULL")).toEqual([]);
    });

    it("parses a native JS array", () => {
      expect(parseSparklineValues([1, 2, 3.5, 4])).toEqual([1, 2, 3.5, 4]);
    });

    it("filters non-finite values from arrays", () => {
      expect(parseSparklineValues([1, NaN, 2, Infinity, 3, null])).toEqual([1, 2, 3]);
    });

    it("parses a single number", () => {
      expect(parseSparklineValues(42)).toEqual([42]);
    });

    it("parses a JSON-array string", () => {
      expect(parseSparklineValues("[1, 2, 3, 4]")).toEqual([1, 2, 3, 4]);
      expect(parseSparklineValues("[1.1,2.2,3.3]")).toEqual([1.1, 2.2, 3.3]);
    });

    it("parses a comma-separated string", () => {
      expect(parseSparklineValues("1,2,3,4")).toEqual([1, 2, 3, 4]);
      expect(parseSparklineValues("1, 2, 3, 4")).toEqual([1, 2, 3, 4]);
    });

    it("parses a whitespace-separated string", () => {
      expect(parseSparklineValues("1 2 3 4")).toEqual([1, 2, 3, 4]);
    });

    it("parses a Postgres array text literal", () => {
      expect(parseSparklineValues("{1,2,3,4}")).toEqual([1, 2, 3, 4]);
      // Postgres-style NULL in array is skipped, finite numbers kept
      expect(parseSparklineValues("{10,20,NULL,30}")).toEqual([10, 20, 30]);
    });

    it("parses a semicolon-separated string", () => {
      expect(parseSparklineValues("1;2;3")).toEqual([1, 2, 3]);
    });

    it("coerces numeric-string entries inside JSON arrays", () => {
      expect(parseSparklineValues('["1", "2.5", "3"]')).toEqual([1, 2.5, 3]);
    });

    it("returns [] when string has no numeric content", () => {
      expect(parseSparklineValues("foo, bar, baz")).toEqual([]);
    });

    it("falls back to delimiter parsing when JSON.parse fails", () => {
      // trailing comma is invalid JSON but should still parse
      expect(parseSparklineValues("[1, 2, 3,]")).toEqual([1, 2, 3]);
    });
  });

  describe("resolveSparklineColor", () => {
    it("returns 'positive' when last >= first in auto mode", () => {
      expect(resolveSparklineColor("auto", undefined, [1, 2, 3])).toBe("positive");
      expect(resolveSparklineColor("auto", undefined, [5, 5])).toBe("positive");
      expect(resolveSparklineColor(undefined, undefined, [1, 5])).toBe("positive");
    });

    it("returns 'negative' when last < first in auto mode", () => {
      expect(resolveSparklineColor("auto", undefined, [5, 4, 3])).toBe("negative");
      expect(resolveSparklineColor("auto", undefined, [100, 0])).toBe("negative");
    });

    it("returns 'primary' for very short series in auto mode", () => {
      expect(resolveSparklineColor("auto", undefined, [])).toBe("primary");
      expect(resolveSparklineColor("auto", undefined, [5])).toBe("primary");
    });

    it("passes through semantic tokens verbatim", () => {
      expect(resolveSparklineColor("positive", undefined, [1, 2])).toBe("positive");
      expect(resolveSparklineColor("warning", undefined, [1])).toBe("warning");
      expect(resolveSparklineColor("primary", undefined, [])).toBe("primary");
    });

    it("returns the custom color when 'custom' + value provided", () => {
      expect(resolveSparklineColor("custom", "#ff00aa", [1, 2])).toBe("#ff00aa");
    });

    it("falls back to 'primary' when 'custom' but no value provided", () => {
      expect(resolveSparklineColor("custom", "", [1, 2])).toBe("primary");
      expect(resolveSparklineColor("custom", "   ", [1, 2])).toBe("primary");
      expect(resolveSparklineColor("custom", undefined, [1, 2])).toBe("primary");
    });
  });
});
