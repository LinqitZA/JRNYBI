import getOptions from "./getOptions";
import Renderer from "./Renderer";
import Editor from "./Editor";

export default {
  type: "REPORT",
  name: "Report",
  getOptions,
  Renderer,
  Editor,

  autoHeight: true,
  defaultRows: 16,
  defaultColumns: 6,
  minColumns: 2,
};
