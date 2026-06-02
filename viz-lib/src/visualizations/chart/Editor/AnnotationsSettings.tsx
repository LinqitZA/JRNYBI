/* eslint-disable react/prop-types */
import { isArray, toNumber } from "lodash";
import React, { useCallback } from "react";
import * as Grid from "antd/lib/grid";
import { useDebouncedCallback } from "use-debounce";
import Button from "antd/lib/button";
import Popconfirm from "antd/lib/popconfirm";
import PlusOutlinedIcon from "@ant-design/icons/PlusOutlined";
import DeleteOutlinedIcon from "@ant-design/icons/DeleteOutlined";
import {
  Section,
  Select,
  Input,
  InputNumber,
  ColorPicker,
} from "@/components/visualizations/editor";
import { UpdateOptionsStrategy } from "@/components/visualizations/editor/createTabbedEditor";
import { EditorPropTypes } from "@/visualizations/prop-types";

/**
 * Feature #188 — Chart annotations editor
 *
 * Annotations are stored on options.annotations as an array of objects:
 *   { id: string, type: "vline" | "range" | "point", label: string,
 *     x: string|number, x2?: string|number, y?: string|number,
 *     color: string, opacity: number, labelPosition: "top"|"middle"|"bottom" }
 *
 * They are translated into Plotly layout.shapes + layout.annotations in
 * viz-lib/src/visualizations/chart/plotly/prepareLayout.ts.
 *
 * The "Annotations" tab in the chart editor is hidden for chart types that
 * don't have a real x-axis (pie, custom).
 */

type Annotation = {
  id: string;
  type: "vline" | "range" | "point";
  label: string;
  x: string | number;
  x2?: string | number;
  y?: string | number;
  color: string;
  opacity: number;
  labelPosition: "top" | "middle" | "bottom";
};

const DEFAULT_COLOR = "#475569";

function newId(): string {
  // No Date.now/Math.random worry here — runs in browser, not in workflow scripts.
  // We still use a monotonic-ish suffix so two consecutive Add clicks don't collide
  // when the user is offline-fast.
  return "ann_" + Math.random().toString(36).slice(2, 9) + "_" + (annotationCounter++);
}

let annotationCounter = 0;

function makeAnnotation(type: Annotation["type"]): Annotation {
  return {
    id: newId(),
    type,
    label: "",
    x: "",
    x2: type === "range" ? "" : undefined,
    y: type === "point" ? "" : undefined,
    color: DEFAULT_COLOR,
    opacity: type === "range" ? 0.15 : 1,
    labelPosition: "top",
  };
}

function normalizeAnnotations(value: any): Annotation[] {
  return isArray(value) ? value.filter(a => a && typeof a === "object") : [];
}

export default function AnnotationsSettings({ options, onOptionsChange }: any) {
  const annotations: Annotation[] = normalizeAnnotations(options.annotations);

  const commit = useCallback(
    (next: Annotation[]) => {
      // shallowMerge so the array is replaced wholesale. The default deepMerge
      // would index-merge our two arrays, which breaks deletion (the removed
      // tail entry would survive).
      onOptionsChange({ annotations: next.slice() }, UpdateOptionsStrategy.shallowMerge);
    },
    [onOptionsChange]
  );

  const [debouncedCommit] = useDebouncedCallback(commit, 200);

  function patchAt(index: number, patch: Partial<Annotation>, debounce: boolean = false) {
    const next = annotations.slice();
    next[index] = { ...next[index], ...patch };
    (debounce ? debouncedCommit : commit)(next);
  }

  function removeAt(index: number) {
    const next = annotations.slice();
    next.splice(index, 1);
    commit(next);
  }

  function addAnnotation(type: Annotation["type"]) {
    commit([...annotations, makeAnnotation(type)]);
  }

  return (
    <React.Fragment>
      {/* @ts-expect-error Section children typing */}
      <Section>
        <ControlRow label="Add annotation">
          <Button
            data-test="Chart.Annotations.AddVLine"
            size="small"
            icon={<PlusOutlinedIcon />}
            onClick={() => addAnnotation("vline")}
            style={{ marginRight: 6 }}>
            Vertical line
          </Button>
          <Button
            data-test="Chart.Annotations.AddRange"
            size="small"
            icon={<PlusOutlinedIcon />}
            onClick={() => addAnnotation("range")}
            style={{ marginRight: 6 }}>
            Date range
          </Button>
          <Button
            data-test="Chart.Annotations.AddPoint"
            size="small"
            icon={<PlusOutlinedIcon />}
            onClick={() => addAnnotation("point")}>
            Point callout
          </Button>
        </ControlRow>
      </Section>

      {annotations.length === 0 && (
        // @ts-expect-error Section children typing
        <Section>
          <div
            data-test="Chart.Annotations.Empty"
            style={{ color: "#94a3b8", fontStyle: "italic", padding: "6px 0" }}>
            No annotations yet. Add a vertical line at an event date, a shaded date range,
            or a text callout pointing at a data point.
          </div>
        </Section>
      )}

      {annotations.map((annotation, index) => (
        <AnnotationRow
          key={annotation.id || index}
          index={index}
          annotation={annotation}
          onPatch={(patch: Partial<Annotation>, debounce: boolean) => patchAt(index, patch, debounce)}
          onRemove={() => removeAt(index)}
        />
      ))}

      {/* @ts-expect-error Section children typing */}
      <Section>
        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
          <strong>JSON shape</strong> (paste into <code>options.annotations</code>):
          <pre style={{ marginTop: 4, marginBottom: 0, fontSize: 11 }}>{
`[
  { "type": "vline",  "x": "2024-01-15",     "label": "Launch",    "color": "#0ea5e9" },
  { "type": "range",  "x": "2024-06-01", "x2": "2024-06-30", "label": "Sale", "color": "#22c55e", "opacity": 0.15 },
  { "type": "point",  "x": "2024-03-10", "y": 42000, "label": "Spike", "color": "#ef4444" }
]`
          }</pre>
        </div>
      </Section>
    </React.Fragment>
  );
}

AnnotationsSettings.propTypes = EditorPropTypes;

function ControlRow({ label, children }: any) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, color: "#334155", marginBottom: 4 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function AnnotationRow({ index, annotation, onPatch, onRemove }: any) {
  const isRange = annotation.type === "range";
  const isPoint = annotation.type === "point";

  return (
    <div
      data-test={`Chart.Annotations.Item.${index}`}
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        padding: 10,
        marginBottom: 8,
        background: "#f8fafc",
      }}>
      <Grid.Row gutter={8} align="middle" style={{ marginBottom: 6 }}>
        <Grid.Col span={6}>
          <strong style={{ fontSize: 12, textTransform: "uppercase", color: "#475569" }}>
            {annotation.type === "vline" ? "Line" : annotation.type === "range" ? "Range" : "Point"}{" "}
            #{index + 1}
          </strong>
        </Grid.Col>
        <Grid.Col span={18} style={{ textAlign: "right" }}>
          <Popconfirm
            title="Delete this annotation?"
            okText="Delete"
            cancelText="Cancel"
            onConfirm={onRemove}>
            <Button
              data-test={`Chart.Annotations.Item.${index}.Delete`}
              size="small"
              danger
              type="text"
              icon={<DeleteOutlinedIcon />}>
              Remove
            </Button>
          </Popconfirm>
        </Grid.Col>
      </Grid.Row>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Input
          label="Label"
          data-test={`Chart.Annotations.Item.${index}.Label`}
          defaultValue={annotation.label}
          onChange={(e: any) => onPatch({ label: e.target.value }, true)}
        />
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Grid.Row gutter={8}>
          <Grid.Col span={isRange ? 12 : isPoint ? 12 : 24}>
            <Input
              label={isRange ? "Start (x)" : "X position"}
              data-test={`Chart.Annotations.Item.${index}.X`}
              placeholder="e.g. 2024-01-15 or category value"
              defaultValue={annotation.x as string}
              onChange={(e: any) => onPatch({ x: e.target.value }, true)}
            />
          </Grid.Col>
          {isRange && (
            <Grid.Col span={12}>
              <Input
                label="End (x)"
                data-test={`Chart.Annotations.Item.${index}.X2`}
                placeholder="e.g. 2024-01-31"
                defaultValue={(annotation.x2 as string) || ""}
                onChange={(e: any) => onPatch({ x2: e.target.value }, true)}
              />
            </Grid.Col>
          )}
          {isPoint && (
            <Grid.Col span={12}>
              <Input
                label="Y value"
                data-test={`Chart.Annotations.Item.${index}.Y`}
                placeholder="numeric y"
                defaultValue={annotation.y == null ? "" : String(annotation.y)}
                onChange={(e: any) => onPatch({ y: e.target.value }, true)}
              />
            </Grid.Col>
          )}
        </Grid.Row>
      </Section>

      {/* @ts-expect-error Section children typing */}
      <Section>
        <Grid.Row gutter={8}>
          <Grid.Col span={8}>
            <ColorPicker
              label="Color"
              data-test={`Chart.Annotations.Item.${index}.Color`}
              interactive
              presetColors={[
                "#475569",
                "#0ea5e9",
                "#22c55e",
                "#f59e0b",
                "#ef4444",
                "#a855f7",
              ]}
              color={annotation.color || DEFAULT_COLOR}
              onChange={(c: any) => onPatch({ color: c || DEFAULT_COLOR })}
            />
          </Grid.Col>
          <Grid.Col span={8}>
            <InputNumber
              label="Opacity"
              data-test={`Chart.Annotations.Item.${index}.Opacity`}
              min={0}
              max={1}
              step={0.05}
              defaultValue={annotation.opacity ?? (isRange ? 0.15 : 1)}
              onChange={(v: any) => {
                const n = toNumber(v);
                onPatch({ opacity: isNaN(n) ? (isRange ? 0.15 : 1) : Math.max(0, Math.min(1, n)) });
              }}
            />
          </Grid.Col>
          <Grid.Col span={8}>
            <Select
              label="Label position"
              data-test={`Chart.Annotations.Item.${index}.LabelPosition`}
              value={annotation.labelPosition || "top"}
              onChange={(v: any) => onPatch({ labelPosition: v })}>
              {/* @ts-expect-error Select.Option typing */}
              <Select.Option value="top">Top</Select.Option>
              {/* @ts-expect-error Select.Option typing */}
              <Select.Option value="middle">Middle</Select.Option>
              {/* @ts-expect-error Select.Option typing */}
              <Select.Option value="bottom">Bottom</Select.Option>
            </Select>
          </Grid.Col>
        </Grid.Row>
      </Section>
    </div>
  );
}
