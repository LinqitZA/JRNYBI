import { dataBarGeometry } from "./dataBar";

describe("Visualizations -> Table -> Columns -> DataBar geometry", () => {
  it("returns show=false for non-finite values", () => {
    expect(dataBarGeometry(NaN, 0, 100)).toEqual({
      show: false,
      isNegative: false,
      leftPct: 0,
      widthPct: 0,
      hasNegativeAxis: false,
    });
    expect(dataBarGeometry(Infinity, 0, 100).show).toBe(false);
  });

  describe("all-positive column", () => {
    it("scales bar from left edge", () => {
      const g = dataBarGeometry(50, 0, 100);
      expect(g.leftPct).toBe(0);
      expect(g.widthPct).toBe(50);
      expect(g.isNegative).toBe(false);
      expect(g.hasNegativeAxis).toBe(false);
    });
    it("renders 0 width for zero value", () => {
      const g = dataBarGeometry(0, 0, 100);
      expect(g.widthPct).toBe(0);
    });
    it("clamps to 100% at the column max", () => {
      const g = dataBarGeometry(100, 0, 100);
      expect(g.widthPct).toBe(100);
    });
    it("handles min === max === 0 safely", () => {
      const g = dataBarGeometry(0, 0, 0);
      expect(g.widthPct).toBe(0);
    });
  });

  describe("all-negative column", () => {
    it("anchors the bar on the right edge and grows leftward", () => {
      const g = dataBarGeometry(-50, -100, -10);
      expect(g.isNegative).toBe(true);
      expect(g.widthPct).toBe(50); // |-50/-100| * 100
      expect(g.leftPct).toBe(50); // 100 - widthPct
    });
    it("min == -100 -> 100% wide bar starting at left", () => {
      const g = dataBarGeometry(-100, -100, -1);
      expect(g.widthPct).toBe(100);
      expect(g.leftPct).toBe(0);
    });
  });

  describe("mixed-sign column", () => {
    it("places positive bars to the right of the 50% axis", () => {
      const g = dataBarGeometry(50, -100, 100);
      expect(g.hasNegativeAxis).toBe(true);
      expect(g.isNegative).toBe(false);
      expect(g.leftPct).toBe(50);
      expect(g.widthPct).toBe(25); // 50/100 * 50
    });
    it("places negative bars to the left of the 50% axis", () => {
      const g = dataBarGeometry(-50, -100, 100);
      expect(g.hasNegativeAxis).toBe(true);
      expect(g.isNegative).toBe(true);
      expect(g.widthPct).toBe(25); // 50/100 * 50
      expect(g.leftPct).toBe(25); // 50 - 25
    });
    it("max-positive value reaches the right edge", () => {
      const g = dataBarGeometry(100, -100, 100);
      expect(g.widthPct).toBe(50);
      expect(g.leftPct).toBe(50);
    });
    it("min-negative value reaches the left edge", () => {
      const g = dataBarGeometry(-100, -100, 100);
      expect(g.widthPct).toBe(50);
      expect(g.leftPct).toBe(0);
    });
    it("zero value renders no bar (width=0)", () => {
      const g = dataBarGeometry(0, -100, 100);
      expect(g.widthPct).toBe(0);
    });
  });
});
