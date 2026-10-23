import { axios } from "@/services/axios";
import notification from "@/services/notification";
import { downloadExcelAsShown, exportVisualizationAsShown, NOT_EXPORTABLE_MESSAGE } from "./excelExport";

jest.mock("@/services/axios", () => ({ axios: { post: jest.fn() } }));
jest.mock("@/services/notification", () => ({ __esModule: true, default: { error: jest.fn(), warning: jest.fn() } }));

const grid = () => ({ rows: [[{ v: "A", t: "s", s: "header" }]], header_rows: 1, header_cols: 0, merges: [] });

describe("downloadExcelAsShown", () => {
  let anchors;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    anchors = [];
    window.URL.createObjectURL = jest.fn(() => "blob:fake");
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click() {
      anchors.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("posts the grid as a blob request, fills title and subtitle, and saves <title>.xlsx", async () => {
    const blob = new Blob(["xlsx"]);
    axios.post.mockResolvedValue(blob);

    const ok = await downloadExcelAsShown(grid(), { title: "Shoprite: Weekly", subtitle: "Exported now" });

    expect(ok).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      "api/jrny/excel-export",
      expect.objectContaining({ title: "Shoprite: Weekly", subtitle: "Exported now", header_rows: 1 }),
      { responseType: "blob" }
    );
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchors).toEqual([{ href: "blob:fake", download: "Shoprite_ Weekly.xlsx", attached: true }]);
    expect(document.querySelectorAll("a[download]").length).toBe(0);
    jest.runAllTimers();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  test("keeps a title and subtitle the grid already has", async () => {
    axios.post.mockResolvedValue(new Blob(["xlsx"]));
    await downloadExcelAsShown({ ...grid(), title: "Own", subtitle: "Own sub" }, { title: "T", subtitle: "S" });
    expect(axios.post.mock.calls[0][1]).toEqual(expect.objectContaining({ title: "Own", subtitle: "Own sub" }));
    expect(anchors[0].download).toBe("Own.xlsx");
  });

  test("a failed request shows the server message and does not throw", async () => {
    const data = new Blob([JSON.stringify({ message: "Too many cells" })], { type: "application/json" });
    axios.post.mockRejectedValue({ response: { status: 400, data } });

    const ok = await downloadExcelAsShown(grid(), { title: "T" });

    expect(ok).toBe(false);
    expect(notification.error).toHaveBeenCalledWith("Couldn't download the Excel file", "Too many cells");
    expect(anchors).toEqual([]);
  });

  test("a failure without a readable message still shows a notification", async () => {
    axios.post.mockRejectedValue(new Error("Network Error"));
    const ok = await downloadExcelAsShown(grid(), { title: "T" });
    expect(ok).toBe(false);
    expect(notification.error).toHaveBeenCalledWith("Couldn't download the Excel file", "Network Error");
  });

  test("a response that is not a blob is reported as an error", async () => {
    axios.post.mockResolvedValue({ message: "not a file" });
    const ok = await downloadExcelAsShown(grid(), { title: "T" });
    expect(ok).toBe(false);
    expect(notification.error).toHaveBeenCalled();
  });
});

describe("exportVisualizationAsShown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("warns when the renderer gives no grid", async () => {
    expect(await exportVisualizationAsShown({ current: { getGrid: () => null } }, { title: "T" })).toBe(false);
    expect(await exportVisualizationAsShown({ current: null }, { title: "T" })).toBe(false);
    expect(await exportVisualizationAsShown(undefined, { title: "T" })).toBe(false);
    expect(notification.warning).toHaveBeenCalledTimes(3);
    expect(notification.warning).toHaveBeenCalledWith(NOT_EXPORTABLE_MESSAGE);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("a getGrid that throws is reported, not thrown", async () => {
    const ref = {
      current: {
        getGrid: () => {
          throw new Error("boom");
        },
      },
    };
    expect(await exportVisualizationAsShown(ref, { title: "T" })).toBe(false);
    expect(notification.error).toHaveBeenCalledWith("Couldn't download the Excel file", "boom");
  });

  test("builds the subtitle from the parameters and downloads", async () => {
    window.URL.createObjectURL = jest.fn(() => "blob:fake");
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    axios.post.mockResolvedValue(new Blob(["xlsx"]));
    const params = [{ name: "po", title: "PONumber", getExecutionValue: () => "X" }];

    const ok = await exportVisualizationAsShown(
      { current: { getGrid: grid } },
      { title: "Report", parameters: params }
    );

    expect(ok).toBe(true);
    const body = axios.post.mock.calls[0][1];
    expect(body.title).toBe("Report");
    expect(body.subtitle).toMatch(/^PONumber: X · Exported \d{1,2} \w{3} \d{4} \d{2}:\d{2}$/);
    jest.restoreAllMocks();
  });
});
