/**
 * Conditional formatting engine for the Table viz (feature #207).
 *
 * Each column in `options.columns[]` may carry a `conditionalFormatting` array.
 * Rules are evaluated top-to-bottom, first match wins. The shape mirrors the
 * "Excel-like" mental model so business users find the configuration intuitive.
 *
 *   type Rule =
 *     | { type: "comparison", op: "gt"|"gte"|"lt"|"lte"|"eq"|"ne"|"between",
 *         value: number, value2?: number,
 *         bg?: string, fg?: string, icon?: string, fontWeight?: "normal"|"bold" }
 *     | { type: "color-scale",  min?: number, max?: number,
 *         minColor: string, maxColor: string,
 *         midColor?: string, midValue?: number,
 *         fg?: "auto"|string }
 *     | { type: "top-bottom", direction: "top"|"bottom", n: number,
 *         bg?: string, fg?: string, icon?: string }
 *     | { type: "contains", text: string, caseSensitive?: boolean,
 *         bg?: string, fg?: string, icon?: string }
 *
 * The renderer calls `buildCellStyle(value, allColumnValues, rules)` per cell.
 * `allColumnValues` is the array of every cell value for that column in the
 * current dataset — only needed for color-scale and top/bottom-N rules, but
 * passed always so callers don't have to special-case.
 *
 * Pure module, no React imports — easy to test in isolation.
 */

export type CellStyle = {
  backgroundColor?: string;
  color?: string;
  fontWeight?: "normal" | "bold";
  icon?: string;
};

export interface ComparisonRule {
  type: "comparison";
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "ne" | "between";
  value: number;
  value2?: number;
  bg?: string;
  fg?: string;
  icon?: string;
  fontWeight?: "normal" | "bold";
}

export interface ColorScaleRule {
  type: "color-scale";
  // Anchor values. If omitted we use the actual data min/max.
  min?: number;
  max?: number;
  // Hex colors (#rrggbb) for low/high anchors. Mid is optional.
  minColor: string;
  maxColor: string;
  midColor?: string;
  midValue?: number;
  fg?: "auto" | string;
}

export interface TopBottomRule {
  type: "top-bottom";
  direction: "top" | "bottom";
  n: number;
  bg?: string;
  fg?: string;
  icon?: string;
  fontWeight?: "normal" | "bold";
}

export interface ContainsRule {
  type: "contains";
  text: string;
  caseSensitive?: boolean;
  bg?: string;
  fg?: string;
  icon?: string;
  fontWeight?: "normal" | "bold";
}

export type Rule = ComparisonRule | ColorScaleRule | TopBottomRule | ContainsRule;

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function asNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function clamp01(t: number): number {
  if (!isFinite(t)) return 0;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function parseHex(hex: string): [number, number, number] | null {
  if (!hex || typeof hex !== "string") return null;
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map(c => c + c)
      .join("");
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return null;
  return [r, g, b];
}

function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map(c => Math.round(c).toString(16).padStart(2, "0")).join("");
}

export function lerpColor(a: string, b: string, t: number): string {
  const ra = parseHex(a) || [255, 255, 255];
  const rb = parseHex(b) || [255, 255, 255];
  const tt = clamp01(t);
  return toHex([
    ra[0] + (rb[0] - ra[0]) * tt,
    ra[1] + (rb[1] - ra[1]) * tt,
    ra[2] + (rb[2] - ra[2]) * tt,
  ]);
}

/**
 * Pick an accessible foreground (#000 / #fff) for a given background. Uses
 * the WCAG relative-luminance formula; threshold 0.55 was chosen empirically
 * against the JRNY semantic palette.
 */
export function pickReadableForeground(bgHex: string): string {
  const rgb = parseHex(bgHex);
  if (!rgb) return "#000000";
  const [r, g, b] = rgb.map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.55 ? "#1f2937" : "#ffffff";
}

// ---------------------------------------------------------------------------
// Rule evaluators
// ---------------------------------------------------------------------------

function evalComparison(value: any, rule: ComparisonRule): CellStyle | null {
  const n = asNumber(value);
  if (n === null) return null;
  const a = asNumber(rule.value);
  const b = rule.value2 != null ? asNumber(rule.value2) : null;
  if (a === null) return null;
  let match = false;
  switch (rule.op) {
    case "gt":
      match = n > a;
      break;
    case "gte":
      match = n >= a;
      break;
    case "lt":
      match = n < a;
      break;
    case "lte":
      match = n <= a;
      break;
    case "eq":
      match = n === a;
      break;
    case "ne":
      match = n !== a;
      break;
    case "between": {
      if (b === null) return null;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      match = n >= lo && n <= hi;
      break;
    }
    default:
      return null;
  }
  if (!match) return null;
  return styleFromRule(rule);
}

function evalContains(value: any, rule: ContainsRule): CellStyle | null {
  const needle = rule.text || "";
  if (!needle) return null;
  const haystack = value == null ? "" : String(value);
  const cs = !!rule.caseSensitive;
  const found = cs ? haystack.includes(needle) : haystack.toLowerCase().includes(needle.toLowerCase());
  if (!found) return null;
  return styleFromRule(rule);
}

function styleFromRule(rule: Rule): CellStyle {
  const style: CellStyle = {};
  if ("bg" in rule && rule.bg) style.backgroundColor = rule.bg;
  if ("fg" in rule && typeof rule.fg === "string" && rule.fg !== "auto") {
    style.color = rule.fg;
  }
  if ("fontWeight" in rule && rule.fontWeight) style.fontWeight = rule.fontWeight;
  if ("icon" in rule && rule.icon) style.icon = rule.icon;
  // Auto-fg fallback for any rule with bg but no explicit fg.
  if (style.backgroundColor && !style.color) {
    style.color = pickReadableForeground(style.backgroundColor);
  }
  return style;
}

function evalColorScale(value: any, columnValues: number[], rule: ColorScaleRule): CellStyle | null {
  const n = asNumber(value);
  if (n === null) return null;
  let min = rule.min != null ? asNumber(rule.min) : null;
  let max = rule.max != null ? asNumber(rule.max) : null;
  if (min === null || max === null) {
    if (columnValues.length === 0) return null;
    const dmin = Math.min(...columnValues);
    const dmax = Math.max(...columnValues);
    if (min === null) min = dmin;
    if (max === null) max = dmax;
  }
  if (max === min) {
    return { backgroundColor: rule.minColor, color: pickReadableForeground(rule.minColor) };
  }
  const t = clamp01((n - min) / (max - min));
  let bg: string;
  if (rule.midColor && rule.midValue != null) {
    const mv = asNumber(rule.midValue);
    if (mv !== null && min < mv && mv < max) {
      const tm = (mv - min) / (max - min);
      if (t <= tm) {
        bg = lerpColor(rule.minColor, rule.midColor, t / Math.max(tm, 1e-9));
      } else {
        bg = lerpColor(rule.midColor, rule.maxColor, (t - tm) / Math.max(1 - tm, 1e-9));
      }
    } else {
      bg = lerpColor(rule.minColor, rule.maxColor, t);
    }
  } else if (rule.midColor) {
    if (t <= 0.5) bg = lerpColor(rule.minColor, rule.midColor, t / 0.5);
    else bg = lerpColor(rule.midColor, rule.maxColor, (t - 0.5) / 0.5);
  } else {
    bg = lerpColor(rule.minColor, rule.maxColor, t);
  }
  const fg = rule.fg && rule.fg !== "auto" ? rule.fg : pickReadableForeground(bg);
  return { backgroundColor: bg, color: fg };
}

function evalTopBottom(value: any, columnValues: number[], rule: TopBottomRule): CellStyle | null {
  const n = asNumber(value);
  if (n === null) return null;
  if (columnValues.length === 0 || rule.n <= 0) return null;
  const sorted = [...columnValues].sort((a, b) => (rule.direction === "top" ? b - a : a - b));
  const cutoff = sorted[Math.min(rule.n, sorted.length) - 1];
  const inSet = rule.direction === "top" ? n >= cutoff : n <= cutoff;
  if (!inSet) return null;
  return styleFromRule(rule);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function extractColumnNumbers(rows: any[], columnName: string): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const n = asNumber(row && row[columnName]);
    if (n !== null) out.push(n);
  }
  return out;
}

/**
 * Evaluate a rule list against a cell value. Returns the first-match style or
 * an empty object if no rule matched.
 *
 * `columnValues` is the pre-extracted numeric list for the column — caller
 * memoises it once per render.
 */
export function evaluateRules(
  value: any,
  columnValues: number[],
  rules: Rule[] | undefined
): CellStyle {
  if (!rules || rules.length === 0) return {};
  for (const rule of rules) {
    let style: CellStyle | null = null;
    switch (rule.type) {
      case "comparison":
        style = evalComparison(value, rule);
        break;
      case "color-scale":
        style = evalColorScale(value, columnValues, rule);
        break;
      case "top-bottom":
        style = evalTopBottom(value, columnValues, rule);
        break;
      case "contains":
        style = evalContains(value, rule);
        break;
      default:
        style = null;
    }
    if (style && Object.keys(style).length > 0) return style;
  }
  return {};
}

/**
 * Convert a CellStyle to an AG Grid `cellStyle` object. The `icon` channel is
 * not a CSS prop — callers wire it via the cellRenderer instead.
 */
export function toAgCellStyle(style: CellStyle): Record<string, string> {
  const out: Record<string, string> = {};
  if (style.backgroundColor) out.backgroundColor = style.backgroundColor;
  if (style.color) out.color = style.color;
  if (style.fontWeight) out.fontWeight = String(style.fontWeight);
  return out;
}
