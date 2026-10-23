import React from "react";
import { mount } from "enzyme";
import QueryBasedParameterInput from "./QueryBasedParameterInput";

// An empty dropdown parameter shows its first option and proposes it as a pending value, which is what
// makes the dashboard's "Apply Changes" button appear. The dashboard rebuilds its parameter objects each
// time a widget finishes loading, and a rebuilt parameter has no pending value. The input must propose
// the shown option again, or the button disappears while the dropdown still shows a value (the AON
// Income Statement: its "Date Report Executed" widget finishes after the dropdown has loaded).

const OPTIONS = [
  { name: "October FY 2027", value: "2027-08" },
  { name: "September FY 2027", value: "2027-07" },
];

function makeParameter() {
  return { loadDropdownValues: () => Promise.resolve(OPTIONS) };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("QueryBasedParameterInput with an empty value", () => {
  it("proposes the first option once the options have loaded", async () => {
    const onSelect = jest.fn();
    const wrapper = mount(
      <QueryBasedParameterInput parameter={makeParameter()} queryId={91} value={null} onSelect={onSelect} />
    );
    await flush();
    wrapper.update();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith("2027-08");
  });

  it("proposes the shown option again when it is given a rebuilt parameter that is still empty", async () => {
    const onSelect = jest.fn();
    const wrapper = mount(
      <QueryBasedParameterInput parameter={makeParameter()} queryId={91} value={null} onSelect={onSelect} />
    );
    await flush();
    onSelect.mockClear();

    wrapper.setProps({ parameter: makeParameter() });
    await flush();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith("2027-08");
  });

  it("proposes nothing for a rebuilt parameter that already has a valid value", async () => {
    const onSelect = jest.fn();
    const wrapper = mount(
      <QueryBasedParameterInput parameter={makeParameter()} queryId={91} value="2027-07" onSelect={onSelect} />
    );
    await flush();
    onSelect.mockClear();

    wrapper.setProps({ parameter: makeParameter() });
    await flush();

    expect(onSelect).not.toHaveBeenCalled();
  });
});
