/**
 * Counter / KPI Card v2 — Tabbed Editor (feature #192)
 *
 * Tab order is intentional and follows the configuration flow:
 *   Value       — pick the headline number
 *   Comparison  — set up the delta chip
 *   Sparkline   — toggle and configure the trend strip + narrative
 *   Thresholds  — define colour bands
 *   Format      — number formatting (decimals, separators, prefix/suffix)
 *
 * The original "General" / "Format" tabs are renamed Value/Format. Existing
 * widget options remain bit-for-bit compatible.
 */
import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";

import ValueSettings from "./ValueSettings";
import ComparisonSettings from "./ComparisonSettings";
import SparklineSettings from "./SparklineSettings";
import ThresholdsSettings from "./ThresholdsSettings";
import FormatSettings from "./FormatSettings";

export default createTabbedEditor([
  { key: "Value", title: "Value", component: ValueSettings },
  { key: "Comparison", title: "Comparison", component: ComparisonSettings },
  { key: "Sparkline", title: "Sparkline", component: SparklineSettings },
  { key: "Thresholds", title: "Thresholds", component: ThresholdsSettings },
  { key: "Format", title: "Format", component: FormatSettings },
]);
