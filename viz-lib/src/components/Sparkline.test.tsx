import React from "react";
import enzyme from "enzyme";

import Sparkline from "./Sparkline";

describe("Sparkline (JRNYBI wrapper for react-sparklines)", () => {
  const sampleData = [3, 7, 4, 9, 5, 11, 6, 12];

  test("mounts cleanly under React 16 with default (line) variant", () => {
    const el = enzyme.mount(<Sparkline data={sampleData} ariaLabel="Revenue trend" />);
    expect(el.find("svg").length).toBeGreaterThanOrEqual(1);
    // Default polyline (line variant)
    expect(el.find("polyline").length).toBeGreaterThanOrEqual(1);
    // ARIA label exposed on wrapper so screen readers can describe the chart
    expect(el.find("[aria-label='Revenue trend']").exists()).toBe(true);
    el.unmount();
  });

  test('renders bars when variant="bar"', () => {
    const el = enzyme.mount(<Sparkline data={sampleData} variant="bar" />);
    expect(el.find("svg").length).toBeGreaterThanOrEqual(1);
    expect(el.find("rect").length).toBeGreaterThan(0);
    el.unmount();
  });

  test('renders spots when variant="spots"', () => {
    const el = enzyme.mount(<Sparkline data={sampleData} variant="spots" />);
    expect(el.find("svg").length).toBeGreaterThanOrEqual(1);
    expect(el.find("circle").length).toBeGreaterThan(0);
    el.unmount();
  });

  test("returns null for empty / invalid data instead of rendering broken svg", () => {
    const empty = enzyme.mount(<Sparkline data={[]} />);
    expect(empty.html()).toBeNull();
    empty.unmount();

    const allNaN = enzyme.mount(<Sparkline data={[NaN, NaN, Infinity]} />);
    expect(allNaN.html()).toBeNull();
    allNaN.unmount();
  });

  test("accepts semantic color tokens that resolve to JRNY CSS vars", () => {
    const el = enzyme.mount(<Sparkline data={sampleData} color="positive" />);
    const html = el.html();
    // Expect the resolved color var to appear somewhere in the rendered output
    expect(html).toMatch(/--jrny-positive/);
    el.unmount();
  });

  test("accepts a raw color string", () => {
    const el = enzyme.mount(<Sparkline data={sampleData} color="#abcdef" />);
    expect(el.html()).toMatch(/#abcdef/i);
    el.unmount();
  });

  test('honours custom width / height props', () => {
    const el = enzyme.mount(<Sparkline data={sampleData} width={200} height={50} />);
    const svg = el.find("svg").first();
    expect(svg.prop("width")).toBe(200);
    expect(svg.prop("height")).toBe(50);
    el.unmount();
  });

  test('hides from screen readers by default (aria-hidden) when no ariaLabel provided', () => {
    const el = enzyme.mount(<Sparkline data={sampleData} />);
    expect(el.find("[aria-hidden='true']").exists()).toBe(true);
    el.unmount();
  });
});
