// Feature #196: Network / graph chart type (ECharts)
//
// Unit tests for the getOption builder. Verifies column auto-detection,
// node-derivation from edges, weight-based degree calculation, group
// colour mapping, layout selection, node/edge size scaling, label
// visibility thresholds, and arrow toggling.

import getOption from "./getOption";

const sampleData = (rows: Array<Record<string, any>>, columns: string[]) => ({
  rows,
  columns: columns.map((c) => ({ name: c, type: "string" })),
});

describe("network getOption", () => {
  // ---------------------------------------------------------------------------
  // Empty + column auto-detection
  // ---------------------------------------------------------------------------
  test("renders an empty-state title when no rows", () => {
    const opt = getOption({ rows: [], columns: [] }, {});
    expect(opt.title.text).toMatch(/pick source/i);
  });

  test("auto-detects source / target columns by name", () => {
    const data = sampleData(
      [
        { source: "A", target: "B" },
        { source: "B", target: "C" },
      ],
      ["source", "target"]
    );
    const opt = getOption(data, {});
    expect(opt.series[0].data.map((n: any) => n.id).sort()).toEqual(["A", "B", "C"]);
    expect(opt.series[0].edges.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Node derivation + degree weighting
  // ---------------------------------------------------------------------------
  test("derives nodes from edge endpoints and weights node size by degree", () => {
    const data = sampleData(
      [
        { source: "hub", target: "spoke1" },
        { source: "hub", target: "spoke2" },
        { source: "hub", target: "spoke3" },
      ],
      ["source", "target"]
    );
    const opt = getOption(data, {});
    const hub = opt.series[0].data.find((n: any) => n.id === "hub");
    const spoke = opt.series[0].data.find((n: any) => n.id === "spoke1");
    // Hub has 3 edges (weight=1 each → size=3); spoke has 1.
    expect(hub.value).toBe(3);
    expect(spoke.value).toBe(1);
    expect(hub.symbolSize).toBeGreaterThan(spoke.symbolSize);
  });

  test("sums explicit edge weights into node size", () => {
    const data = sampleData(
      [
        { src: "A", dst: "B", amount: 10 },
        { src: "A", dst: "C", amount: 5 },
        { src: "B", dst: "C", amount: 2 },
      ],
      ["src", "dst", "amount"]
    );
    const opt = getOption(data, {});
    const a = opt.series[0].data.find((n: any) => n.id === "A");
    const b = opt.series[0].data.find((n: any) => n.id === "B");
    const c = opt.series[0].data.find((n: any) => n.id === "C");
    expect(a.value).toBe(15); // 10 + 5
    expect(b.value).toBe(12); // 10 + 2
    expect(c.value).toBe(7);  // 5 + 2
  });

  test("skips rows with missing source or target", () => {
    const data = sampleData(
      [
        { source: "A", target: "B" },
        { source: null, target: "C" },
        { source: "D", target: "" },
      ],
      ["source", "target"]
    );
    const opt = getOption(data, {});
    expect(opt.series[0].edges.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Group colouring
  // ---------------------------------------------------------------------------
  test("auto-derives categories from source_group / target_group columns", () => {
    const data = sampleData(
      [
        { source: "A1", target: "V1", source_group: "customer", target_group: "vendor" },
        { source: "A2", target: "V1", source_group: "customer", target_group: "vendor" },
      ],
      ["source", "target", "source_group", "target_group"]
    );
    const opt = getOption(data, {});
    // Two categories — customer + vendor
    const catNames = opt.series[0].categories.map((c: any) => c.name).sort();
    expect(catNames).toEqual(["customer", "vendor"]);
  });

  test("applies explicit groupColors overrides on the category entry", () => {
    const data = sampleData(
      [{ source: "A", target: "B", source_group: "customer", target_group: "vendor" }],
      ["source", "target", "source_group", "target_group"]
    );
    const opt = getOption(data, {
      groupColors: { customer: "#10b981", vendor: "#f59e0b" },
    });
    const cust = opt.series[0].categories.find((c: any) => c.name === "customer");
    expect(cust.itemStyle.color).toBe("#10b981");
  });

  test("disables category colouring when colorByGroup is false", () => {
    const data = sampleData(
      [{ source: "A", target: "B", source_group: "customer", target_group: "vendor" }],
      ["source", "target", "source_group", "target_group"]
    );
    const opt = getOption(data, { colorByGroup: false });
    expect(opt.series[0].categories.length).toBe(1);
    expect(opt.series[0].categories[0].name).toBe("default");
  });

  // ---------------------------------------------------------------------------
  // Layout selection
  // ---------------------------------------------------------------------------
  test("defaults to force layout with sensible knobs", () => {
    const data = sampleData(
      [{ source: "A", target: "B" }],
      ["source", "target"]
    );
    const opt = getOption(data, {});
    expect(opt.series[0].layout).toBe("force");
    expect(opt.series[0].force.repulsion).toBe(120);
    expect(opt.series[0].force.gravity).toBe(0.08);
  });

  test("supports circular layout", () => {
    const data = sampleData(
      [{ source: "A", target: "B" }],
      ["source", "target"]
    );
    const opt = getOption(data, { layout: "circular" });
    expect(opt.series[0].layout).toBe("circular");
    expect(opt.series[0].circular.rotateLabel).toBe(true);
    expect(opt.series[0].force).toBeUndefined();
  });

  test("supports manual layout (none)", () => {
    const data = sampleData(
      [{ source: "A", target: "B" }],
      ["source", "target"]
    );
    const opt = getOption(data, { layout: "none" });
    expect(opt.series[0].layout).toBe("none");
  });

  // ---------------------------------------------------------------------------
  // Size scaling + label visibility
  // ---------------------------------------------------------------------------
  test("scales node symbol size into the configured range", () => {
    const data = sampleData(
      [
        { source: "big", target: "small" },
        { source: "big", target: "med" },
        { source: "big", target: "x" },
        { source: "med", target: "x" },
      ],
      ["source", "target"]
    );
    const opt = getOption(data, { nodeSizeMin: 10, nodeSizeMax: 50 });
    const sizes = opt.series[0].data.map((n: any) => n.symbolSize);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
  });

  test("hides labels for nodes below labelMinSize", () => {
    const data = sampleData(
      [
        { source: "A", target: "B", count: 100 },
        { source: "C", target: "D", count: 1 },
      ],
      ["source", "target", "count"]
    );
    const opt = getOption(data, { labelMinSize: 50 });
    const a = opt.series[0].data.find((n: any) => n.id === "A");
    const c = opt.series[0].data.find((n: any) => n.id === "C");
    expect(a.label.show).toBe(true);
    expect(c.label.show).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Arrows + interactivity
  // ---------------------------------------------------------------------------
  test("renders direction arrows when showArrows is true", () => {
    const data = sampleData(
      [{ source: "A", target: "B" }],
      ["source", "target"]
    );
    const opt = getOption(data, { showArrows: true });
    expect(opt.series[0].edgeSymbol).toEqual(["none", "arrow"]);
  });

  test("enables roam (zoom + pan) and draggable nodes by default", () => {
    const data = sampleData(
      [{ source: "A", target: "B" }],
      ["source", "target"]
    );
    const opt = getOption(data, {});
    expect(opt.series[0].roam).toBe(true);
    expect(opt.series[0].draggable).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Tooltip formatting
  // ---------------------------------------------------------------------------
  test("tooltip formats edges and nodes distinctly", () => {
    const data = sampleData(
      [{ source: "A", target: "B" }],
      ["source", "target"]
    );
    const opt = getOption(data, {});
    const edgeHtml = opt.tooltip.formatter({
      dataType: "edge",
      data: { source: "A", target: "B", value: 5 },
    });
    expect(edgeHtml).toContain("A → B");
    expect(edgeHtml).toContain("5");
    const nodeHtml = opt.tooltip.formatter({
      dataType: "node",
      data: { name: "A", value: 12, category: 0 },
    });
    expect(nodeHtml).toContain("A");
    expect(nodeHtml).toContain("12");
  });
});
