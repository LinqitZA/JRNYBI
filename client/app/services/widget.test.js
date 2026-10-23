import Widget from "@/services/widget";
import { Query } from "@/services/query";

// The real visualization registry pulls in echarts' ES modules, which Jest can't load; widget.js only
// reads per-type sizing options from it.
jest.mock("@redash/viz/lib", () => ({ registeredVisualizations: { TABLE: { autoHeight: true } } }));

// A dashboard widget must not run its query while a parameter still has no value: running it only
// produced "Error running query: missing value for … parameter" on every dashboard that opens before
// the viewer has chosen the parameters. Instead it waits, and says which values are needed.

function makeWidget(parameters) {
  return new Widget({
    id: 1,
    options: {},
    visualization: {
      id: 2,
      type: "TABLE",
      name: "Report",
      options: {},
      query: {
        id: 3,
        name: "Report query",
        query: "SELECT 1",
        options: { parameters },
      },
    },
  });
}

describe("Widget.load with query parameters", () => {
  let getQueryResult;

  beforeEach(() => {
    getQueryResult = jest.spyOn(Query.prototype, "getQueryResult").mockImplementation(() => ({
      toPromise: () => Promise.resolve({ ok: true }),
    }));
  });

  afterEach(() => {
    getQueryResult.mockRestore();
  });

  it("does not run the query while a parameter has no value, and lists the missing parameters", async () => {
    const widget = makeWidget([
      { name: "FromDate", title: "From Date", type: "date", value: null },
      { name: "Customer", title: "Customer", type: "text", value: "FOO002" },
    ]);

    await widget.load();

    expect(getQueryResult).not.toHaveBeenCalled();
    expect(widget.awaitingParameters).toEqual(["From Date"]);
    expect(widget.loading).toBe(false);
    expect(widget.getQueryResult()).toBeUndefined();
  });

  it("does not run on a forced refresh either while values are missing", async () => {
    const widget = makeWidget([{ name: "FromDate", title: "From Date", type: "date", value: null }]);

    await widget.load(true);

    expect(getQueryResult).not.toHaveBeenCalled();
    expect(widget.awaitingParameters).toEqual(["From Date"]);
  });

  it("runs the query once every parameter has a value", async () => {
    const widget = makeWidget([{ name: "Customer", title: "Customer", type: "text", value: "FOO002" }]);

    await widget.load();

    expect(getQueryResult).toHaveBeenCalledTimes(1);
    expect(widget.awaitingParameters).toEqual([]);
  });

  it("runs queries without parameters as before", async () => {
    const widget = makeWidget([]);

    await widget.load();

    expect(getQueryResult).toHaveBeenCalledTimes(1);
    expect(widget.awaitingParameters).toEqual([]);
  });
});
