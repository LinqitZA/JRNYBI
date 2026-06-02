/**
 * Conditional formatting editor (feature #207)
 *
 * Per-column editor: lets a user define a list of rules ("color cells red
 * when balance > 100k" / "highlight the bottom 5 categories" / ...). Rules
 * persist as `column.conditionalFormatting: Rule[]`.
 *
 * Kept deliberately compact — Ant Design controls only, no extra deps. The
 * runtime evaluator lives in viz-lib/src/visualizations/shared/conditionalFormatting.ts
 * and is tested in isolation.
 */
import React, { useState } from "react";
import { Section, Select, Input, InputNumber } from "@/components/visualizations/editor";

import { Rule } from "@/visualizations/shared/conditionalFormatting";

type Props = {
  rules?: Rule[];
  onChange: (rules: Rule[]) => any;
  testPrefix?: string;
};

const RULE_TYPES = [
  { value: "comparison", label: "Comparison (e.g. balance > 100k)" },
  { value: "color-scale", label: "Color scale (gradient)" },
  { value: "top-bottom", label: "Top / bottom N" },
  { value: "contains", label: "Text contains" },
];

const COMPARISON_OPS = [
  { value: "gt", label: "Greater than (>)" },
  { value: "gte", label: "Greater than or equal (≥)" },
  { value: "lt", label: "Less than (<)" },
  { value: "lte", label: "Less than or equal (≤)" },
  { value: "eq", label: "Equals (=)" },
  { value: "ne", label: "Not equal (≠)" },
  { value: "between", label: "Between" },
];

function newRule(type: Rule["type"]): Rule {
  switch (type) {
    case "comparison":
      return { type: "comparison", op: "gt", value: 0, bg: "#dc2626" };
    case "color-scale":
      return { type: "color-scale", minColor: "#fee2e2", maxColor: "#16a34a" };
    case "top-bottom":
      return { type: "top-bottom", direction: "top", n: 5, bg: "#16a34a" };
    case "contains":
      return { type: "contains", text: "", bg: "#fbbf24" };
  }
}

export default function ConditionalFormattingEditor({ rules, onChange, testPrefix }: Props) {
  const [pending, setPending] = useState<Rule["type"]>("comparison");
  const list: Rule[] = rules || [];

  const SelectAny = Select as any;
  const InputAny = Input as any;
  const InputNumberAny = InputNumber as any;
  const prefix = testPrefix || "Table.ColumnEditor.CondFmt";

  function updateRule(index: number, changes: Partial<Rule>) {
    const next = [...list];
    next[index] = { ...(next[index] as any), ...(changes as any) };
    onChange(next);
  }

  function deleteRule(index: number) {
    const next = list.filter((_, i) => i !== index);
    onChange(next);
  }

  function moveRule(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addRule() {
    onChange([...list, newRule(pending)]);
  }

  return (
    <div className="cond-fmt-editor" data-test={prefix}>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <SelectAny
              layout="horizontal"
              label="Add a rule"
              data-test={`${prefix}.NewRuleType`}
              defaultValue={pending}
              value={pending}
              onChange={(t: Rule["type"]) => setPending(t)}>
              {RULE_TYPES.map(r => (
                <SelectAny.Option key={r.value} value={r.value}>
                  {r.label}
                </SelectAny.Option>
              ))}
            </SelectAny>
          </div>
          <button
            type="button"
            className="cond-fmt-add-btn"
            data-test={`${prefix}.Add`}
            onClick={addRule}>
            Add
          </button>
        </div>
      </Section>

      {list.length === 0 && (
        <div className="cond-fmt-empty" data-test={`${prefix}.Empty`} style={{ color: "#64748b", fontSize: 12, padding: "4px 0" }}>
          No conditional formatting rules. Add one above.
        </div>
      )}

      {list.map((rule, i) => (
        <div className="cond-fmt-rule" key={i} data-test={`${prefix}.Rule.${i}`} style={{ border: "1px solid #e2e8f0", padding: 8, marginTop: 6, borderRadius: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong style={{ fontSize: 12 }}>
              {i + 1}. {RULE_TYPES.find(r => r.value === rule.type)?.label || rule.type}
            </strong>
            <div>
              <button
                type="button"
                data-test={`${prefix}.Rule.${i}.MoveUp`}
                disabled={i === 0}
                onClick={() => moveRule(i, -1)}
                style={{ marginRight: 4 }}>
                ↑
              </button>
              <button
                type="button"
                data-test={`${prefix}.Rule.${i}.MoveDown`}
                disabled={i === list.length - 1}
                onClick={() => moveRule(i, 1)}
                style={{ marginRight: 4 }}>
                ↓
              </button>
              <button
                type="button"
                data-test={`${prefix}.Rule.${i}.Delete`}
                onClick={() => deleteRule(i)}>
                Delete
              </button>
            </div>
          </div>

          {rule.type === "comparison" && (
            <React.Fragment>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <SelectAny
                  layout="horizontal"
                  label="Operator"
                  data-test={`${prefix}.Rule.${i}.Op`}
                  value={rule.op}
                  onChange={(op: any) => updateRule(i, { op } as any)}>
                  {COMPARISON_OPS.map(o => (
                    <SelectAny.Option key={o.value} value={o.value}>
                      {o.label}
                    </SelectAny.Option>
                  ))}
                </SelectAny>
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputNumberAny
                  layout="horizontal"
                  label="Value"
                  data-test={`${prefix}.Rule.${i}.Value`}
                  value={rule.value}
                  onChange={(value: any) => updateRule(i, { value } as any)}
                />
              </Section>
              {rule.op === "between" && (
                // @ts-expect-error Section children typing
                <Section>
                  <InputNumberAny
                    layout="horizontal"
                    label="Upper bound"
                    data-test={`${prefix}.Rule.${i}.Value2`}
                    value={rule.value2 ?? 0}
                    onChange={(value2: any) => updateRule(i, { value2 } as any)}
                  />
                </Section>
              )}
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Background color (hex)"
                  data-test={`${prefix}.Rule.${i}.Bg`}
                  defaultValue={rule.bg || ""}
                  onChange={(e: any) => updateRule(i, { bg: e.target.value } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Text color (hex, optional)"
                  data-test={`${prefix}.Rule.${i}.Fg`}
                  defaultValue={rule.fg || ""}
                  onChange={(e: any) => updateRule(i, { fg: e.target.value } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Icon (optional, e.g. ⚠ ✓ ↑ ↓)"
                  data-test={`${prefix}.Rule.${i}.Icon`}
                  defaultValue={rule.icon || ""}
                  onChange={(e: any) => updateRule(i, { icon: e.target.value } as any)}
                />
              </Section>
            </React.Fragment>
          )}

          {rule.type === "color-scale" && (
            <React.Fragment>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Min color (hex)"
                  data-test={`${prefix}.Rule.${i}.MinColor`}
                  defaultValue={rule.minColor}
                  onChange={(e: any) => updateRule(i, { minColor: e.target.value } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Max color (hex)"
                  data-test={`${prefix}.Rule.${i}.MaxColor`}
                  defaultValue={rule.maxColor}
                  onChange={(e: any) => updateRule(i, { maxColor: e.target.value } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Mid color (hex, optional)"
                  data-test={`${prefix}.Rule.${i}.MidColor`}
                  defaultValue={rule.midColor || ""}
                  onChange={(e: any) => updateRule(i, { midColor: e.target.value } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputNumberAny
                  layout="horizontal"
                  label="Min value (optional)"
                  data-test={`${prefix}.Rule.${i}.Min`}
                  value={rule.min ?? null}
                  onChange={(min: any) => updateRule(i, { min: min == null ? undefined : min } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputNumberAny
                  layout="horizontal"
                  label="Max value (optional)"
                  data-test={`${prefix}.Rule.${i}.Max`}
                  value={rule.max ?? null}
                  onChange={(max: any) => updateRule(i, { max: max == null ? undefined : max } as any)}
                />
              </Section>
            </React.Fragment>
          )}

          {rule.type === "top-bottom" && (
            <React.Fragment>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <SelectAny
                  layout="horizontal"
                  label="Direction"
                  data-test={`${prefix}.Rule.${i}.Direction`}
                  value={rule.direction}
                  onChange={(direction: any) => updateRule(i, { direction } as any)}>
                  <SelectAny.Option value="top">Top N</SelectAny.Option>
                  <SelectAny.Option value="bottom">Bottom N</SelectAny.Option>
                </SelectAny>
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputNumberAny
                  layout="horizontal"
                  label="N"
                  data-test={`${prefix}.Rule.${i}.N`}
                  value={rule.n}
                  min={1}
                  onChange={(n: any) => updateRule(i, { n } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Background color (hex)"
                  data-test={`${prefix}.Rule.${i}.Bg`}
                  defaultValue={rule.bg || ""}
                  onChange={(e: any) => updateRule(i, { bg: e.target.value } as any)}
                />
              </Section>
            </React.Fragment>
          )}

          {rule.type === "contains" && (
            <React.Fragment>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Text to find"
                  data-test={`${prefix}.Rule.${i}.Text`}
                  defaultValue={rule.text}
                  onChange={(e: any) => updateRule(i, { text: e.target.value } as any)}
                />
              </Section>
              {/* @ts-expect-error Section children typing */}
              <Section>
                <InputAny
                  label="Background color (hex)"
                  data-test={`${prefix}.Rule.${i}.Bg`}
                  defaultValue={rule.bg || ""}
                  onChange={(e: any) => updateRule(i, { bg: e.target.value } as any)}
                />
              </Section>
            </React.Fragment>
          )}
        </div>
      ))}
    </div>
  );
}
