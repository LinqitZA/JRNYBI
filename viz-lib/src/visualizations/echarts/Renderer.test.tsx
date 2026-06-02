import React from "react";
import enzyme from "enzyme";

// Mock echarts-for-react/lib/core so we don't pull in real ECharts at
// jsdom test time (it expects a real canvas/svg layout engine).
jest.mock("echarts-for-react/lib/core", () => {
  return function MockEChartsReactCore(props: any) {
    return (
      <div
        data-test="MockEChartsReactCore"
        data-renderer={props.opts && props.opts.renderer}
        data-theme={typeof props.theme === "string" ? props.theme : "custom"}>
        {/* Serialize the option keys we care about so the test can assert
           that getOption() was actually called and merged. */}
        {JSON.stringify({
          hasOption: !!props.option,
          title: props.option && props.option.title,
        })}
      </div>
    );
  };
});

// Mock the ECharts core registration so we don't pull modules at test time.
jest.mock("./index", () => ({
  registerEChartsModules: jest.fn(),
  echarts: {},
}));

import EChartsRenderer from "./Renderer";
import * as echartsIndex from "./index";

describe("ECharts shared Renderer", () => {
  beforeEach(() => {
    (echartsIndex.registerEChartsModules as jest.Mock).mockClear();
  });

  const sampleData = {
    columns: [{ name: "category" }, { name: "value" }],
    rows: [
      { category: "A", value: 10 },
      { category: "B", value: 20 },
    ],
  };

  function getOption(data: any, options: any) {
    return {
      title: { text: options.title || "Test Chart" },
      series: [{ type: "bar", data: data.rows.map((r: any) => r.value) }],
    };
  }

  test("mounts cleanly under React 16 and registers ECharts modules", () => {
    const el = enzyme.mount(
      <EChartsRenderer data={sampleData} options={{ title: "Hello JRNY" }} getOption={getOption} />
    );
    expect(echartsIndex.registerEChartsModules).toHaveBeenCalled();
    const root = el.find("[data-test='MockEChartsReactCore']");
    expect(root.exists()).toBe(true);
    expect(root.prop("data-theme")).toBe("jrny-light");
    expect(root.prop("data-renderer")).toBe("svg");
    expect(root.text()).toMatch(/Hello JRNY/);
    el.unmount();
  });

  test("honours custom theme + renderer props", () => {
    const el = enzyme.mount(
      <EChartsRenderer
        data={sampleData}
        options={{}}
        getOption={getOption}
        theme="jrny-dark"
        renderer="canvas"
      />
    );
    const root = el.find("[data-test='MockEChartsReactCore']");
    expect(root.prop("data-theme")).toBe("jrny-dark");
    expect(root.prop("data-renderer")).toBe("canvas");
    el.unmount();
  });

  test("renders a fallback option title when getOption throws", () => {
    const failing = () => {
      throw new Error("boom");
    };
    const consoleErr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const el = enzyme.mount(
      <EChartsRenderer data={sampleData} options={{}} getOption={failing} />
    );
    const root = el.find("[data-test='MockEChartsReactCore']");
    expect(root.exists()).toBe(true);
    expect(root.text()).toMatch(/Chart error/);
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
    el.unmount();
  });
});
