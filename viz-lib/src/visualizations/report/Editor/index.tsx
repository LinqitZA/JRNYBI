import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";

import HeaderSettings from "./HeaderSettings";
import ColumnsSettings from "./ColumnsSettings";
import GridSettings from "./GridSettings";
import PublishSettings from "./PublishSettings";

import "./editor.less";

export default createTabbedEditor([
  { key: "Header", title: "Header", component: HeaderSettings },
  { key: "Columns", title: "Columns", component: ColumnsSettings },
  { key: "Grid", title: "Grid", component: GridSettings },
  { key: "Publish", title: "Publish", component: PublishSettings },
]);
