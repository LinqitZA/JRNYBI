import Renderer from "./Renderer";
import Editor from "./Editor";
import getOptions from "./getOptions";

export default {
  type: "COUNTER",
  name: "Counter",
  getOptions,
  Renderer,
  Editor,

  // KPI Card v2 (feature #192) — larger default footprint so the new card
  // layout (big number + delta chip + sparkline strip + optional narrative)
  // has room to breathe. Existing widgets retain whatever size was saved.
  defaultColumns: 4,
  defaultRows: 6,
};
