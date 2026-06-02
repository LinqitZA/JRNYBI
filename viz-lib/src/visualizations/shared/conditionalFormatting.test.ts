import {
  evaluateRules,
  extractColumnNumbers,
  lerpColor,
  pickReadableForeground,
  toAgCellStyle,
  Rule,
} from "./conditionalFormatting";

describe("conditionalFormatting", () => {
  describe("pickReadableForeground", () => {
    it("returns dark text on a light background", () => {
      expect(pickReadableForeground("#ffffff")).toBe("#1f2937");
      expect(pickReadableForeground("#fef3c7")).toBe("#1f2937");
    });
    it("returns light text on a dark background", () => {
      expect(pickReadableForeground("#1e3a8a")).toBe("#ffffff");
      expect(pickReadableForeground("#000000")).toBe("#ffffff");
    });
    it("handles malformed hex by defaulting to dark text", () => {
      expect(pickReadableForeground("zzz")).toBe("#000000");
    });
  });

  describe("lerpColor", () => {
    it("returns the endpoints at t=0 and t=1", () => {
      expect(lerpColor("#000000", "#ffffff", 0)).toBe("#000000");
      expect(lerpColor("#000000", "#ffffff", 1)).toBe("#ffffff");
    });
    it("interpolates at midpoint", () => {
      // 0x80 = 128
      expect(lerpColor("#000000", "#ffffff", 0.5)).toBe("#808080");
    });
    it("clamps t to [0,1]", () => {
      expect(lerpColor("#000000", "#ffffff", -5)).toBe("#000000");
      expect(lerpColor("#000000", "#ffffff", 5)).toBe("#ffffff");
    });
    it("expands 3-char hex", () => {
      expect(lerpColor("#000", "#fff", 0.5)).toBe("#808080");
    });
  });

  describe("evaluateRules (comparison)", () => {
    const baseRule: Rule = { type: "comparison", op: "gt", value: 100, bg: "#dc2626" };

    it("applies background + auto fg when match", () => {
      const r = evaluateRules(150, [], [baseRule]);
      expect(r.backgroundColor).toBe("#dc2626");
      expect(r.color).toBeDefined();
    });

    it("returns empty when no rule matches", () => {
      expect(evaluateRules(50, [], [baseRule])).toEqual({});
    });

    it("supports between (inclusive)", () => {
      const rule: Rule = { type: "comparison", op: "between", value: 10, value2: 20, bg: "#a3e635" };
      expect(evaluateRules(15, [], [rule]).backgroundColor).toBe("#a3e635");
      expect(evaluateRules(10, [], [rule]).backgroundColor).toBe("#a3e635");
      expect(evaluateRules(20, [], [rule]).backgroundColor).toBe("#a3e635");
      expect(evaluateRules(21, [], [rule]).backgroundColor).toBeUndefined();
    });

    it("first-match wins", () => {
      const rules: Rule[] = [
        { type: "comparison", op: "gt", value: 50, bg: "#fbbf24" },
        { type: "comparison", op: "gt", value: 100, bg: "#dc2626" },
      ];
      // 150 matches both — first wins
      expect(evaluateRules(150, [], rules).backgroundColor).toBe("#fbbf24");
    });

    it("coerces numeric strings", () => {
      const r = evaluateRules("150", [], [baseRule]);
      expect(r.backgroundColor).toBe("#dc2626");
    });

    it("explicit fg overrides auto", () => {
      const rule: Rule = { type: "comparison", op: "gt", value: 0, bg: "#dc2626", fg: "#ffeb00" };
      expect(evaluateRules(1, [], [rule]).color).toBe("#ffeb00");
    });

    it("supports eq / ne / lte", () => {
      expect(
        evaluateRules(5, [], [{ type: "comparison", op: "eq", value: 5, bg: "#000000" }]).backgroundColor
      ).toBe("#000000");
      expect(
        evaluateRules(5, [], [{ type: "comparison", op: "ne", value: 4, bg: "#000000" }]).backgroundColor
      ).toBe("#000000");
      expect(
        evaluateRules(5, [], [{ type: "comparison", op: "lte", value: 5, bg: "#000000" }]).backgroundColor
      ).toBe("#000000");
    });

    it("ignores rule with non-numeric threshold gracefully", () => {
      const rule: any = { type: "comparison", op: "gt", value: "not a number", bg: "#000" };
      expect(evaluateRules(100, [], [rule])).toEqual({});
    });
  });

  describe("evaluateRules (contains)", () => {
    it("matches case-insensitive by default", () => {
      const rule: Rule = { type: "contains", text: "overdue", bg: "#dc2626" };
      expect(evaluateRules("Customer is OVERDUE", [], [rule]).backgroundColor).toBe("#dc2626");
    });
    it("matches case-sensitive when flagged", () => {
      const rule: Rule = { type: "contains", text: "OVERDUE", caseSensitive: true, bg: "#dc2626" };
      expect(evaluateRules("overdue", [], [rule]).backgroundColor).toBeUndefined();
      expect(evaluateRules("CUSTOMER OVERDUE", [], [rule]).backgroundColor).toBe("#dc2626");
    });
  });

  describe("evaluateRules (color-scale)", () => {
    it("interpolates between min and max colors when no anchors set", () => {
      const rule: Rule = { type: "color-scale", minColor: "#000000", maxColor: "#ffffff" };
      const values = [0, 50, 100];
      expect(evaluateRules(0, values, [rule]).backgroundColor).toBe("#000000");
      expect(evaluateRules(100, values, [rule]).backgroundColor).toBe("#ffffff");
      expect(evaluateRules(50, values, [rule]).backgroundColor).toBe("#808080");
    });

    it("respects explicit min/max anchors", () => {
      const rule: Rule = {
        type: "color-scale",
        min: 0,
        max: 200,
        minColor: "#000000",
        maxColor: "#ffffff",
      };
      expect(evaluateRules(100, [10, 50], [rule]).backgroundColor).toBe("#808080");
    });

    it("supports a 3-stop midpoint", () => {
      const rule: Rule = {
        type: "color-scale",
        min: 0,
        max: 100,
        midValue: 50,
        minColor: "#ff0000",
        midColor: "#ffffff",
        maxColor: "#00ff00",
      };
      expect(evaluateRules(0, [], [rule]).backgroundColor).toBe("#ff0000");
      expect(evaluateRules(50, [], [rule]).backgroundColor).toBe("#ffffff");
      expect(evaluateRules(100, [], [rule]).backgroundColor).toBe("#00ff00");
    });

    it("falls back gracefully when max === min", () => {
      const rule: Rule = { type: "color-scale", minColor: "#abcdef", maxColor: "#123456" };
      const r = evaluateRules(5, [5, 5, 5], [rule]);
      expect(r.backgroundColor).toBe("#abcdef");
    });
  });

  describe("evaluateRules (top-bottom)", () => {
    it("matches top-N values", () => {
      const rule: Rule = { type: "top-bottom", direction: "top", n: 2, bg: "#000" };
      const values = [10, 20, 30, 40, 50];
      expect(evaluateRules(50, values, [rule]).backgroundColor).toBe("#000");
      expect(evaluateRules(40, values, [rule]).backgroundColor).toBe("#000");
      expect(evaluateRules(30, values, [rule]).backgroundColor).toBeUndefined();
    });
    it("matches bottom-N values", () => {
      const rule: Rule = { type: "top-bottom", direction: "bottom", n: 1, bg: "#000" };
      const values = [10, 20, 30];
      expect(evaluateRules(10, values, [rule]).backgroundColor).toBe("#000");
      expect(evaluateRules(20, values, [rule]).backgroundColor).toBeUndefined();
    });
    it("clamps n > length to length", () => {
      const rule: Rule = { type: "top-bottom", direction: "top", n: 99, bg: "#000" };
      const values = [10, 20];
      expect(evaluateRules(10, values, [rule]).backgroundColor).toBe("#000");
    });
  });

  describe("extractColumnNumbers", () => {
    it("returns numeric values, dropping non-numeric", () => {
      const rows = [{ x: 1 }, { x: "2" }, { x: null }, { x: "foo" }, { x: 3.5 }];
      expect(extractColumnNumbers(rows, "x")).toEqual([1, 2, 3.5]);
    });
    it("returns [] for empty rows", () => {
      expect(extractColumnNumbers([], "x")).toEqual([]);
    });
  });

  describe("toAgCellStyle", () => {
    it("emits bg / color / fontWeight", () => {
      expect(
        toAgCellStyle({ backgroundColor: "#fff", color: "#000", fontWeight: "bold" })
      ).toEqual({ backgroundColor: "#fff", color: "#000", fontWeight: "bold" });
    });
    it("omits empty fields", () => {
      expect(toAgCellStyle({})).toEqual({});
    });
    it("does not leak icon into CSS", () => {
      expect(toAgCellStyle({ backgroundColor: "#fff", icon: "warning" } as any)).toEqual({
        backgroundColor: "#fff",
      });
    });
  });

  describe("rule chaining + no-match", () => {
    it("returns {} when nothing matches", () => {
      const rules: Rule[] = [
        { type: "comparison", op: "gt", value: 1000, bg: "#000" },
        { type: "contains", text: "needle", bg: "#000" },
      ];
      expect(evaluateRules(5, [], rules)).toEqual({});
    });
    it("returns empty for empty rule list", () => {
      expect(evaluateRules(5, [1, 2, 3], [])).toEqual({});
      expect(evaluateRules(5, [], undefined)).toEqual({});
    });
  });
});
