import { map } from "lodash";
import React from "react";
import { Section, Select, Input, Switch, InputNumber } from "@/components/visualizations/editor";
import ColorPicker from "@/components/ColorPicker";
import { EditorPropTypes } from "@/visualizations/prop-types";
import { DEFAULT_METRIC_CARD } from "../getOptions";
import type { MetricCard } from "../getOptions";

const AGGREGATION_OPTIONS = [
  { value: "SUM", label: "Sum" },
  { value: "COUNT", label: "Count" },
  { value: "AVG", label: "Average" },
  { value: "MIN", label: "Minimum" },
  { value: "MAX", label: "Maximum" },
  { value: "FIRST", label: "First Value" },
  { value: "LAST", label: "Last Value" },
];

const FORMAT_OPTIONS = [
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "percentage", label: "Percentage" },
  { value: "date", label: "Date" },
];

function generateId() {
  return "mc_" + Math.random().toString(36).substr(2, 9);
}

function MetricCardEditor({
  card,
  index,
  columns,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  card: MetricCard;
  index: number;
  columns: any[];
  onUpdate: (index: number, updates: Partial<MetricCard>) => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="report-metric-card-editor" data-test={`MetricCardEditor-${index}`}>
      <div className="report-metric-card-editor-header">
        <span className="report-metric-card-editor-title">
          Metric {index + 1}: {card.label || card.column || "(untitled)"}
        </span>
        <div className="report-metric-card-editor-actions">
          {!isFirst && (
            <button
              type="button"
              className="report-metric-card-btn"
              onClick={() => onMoveUp(index)}
              title="Move up">
              <i className="fa fa-arrow-up" />
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              className="report-metric-card-btn"
              onClick={() => onMoveDown(index)}
              title="Move down">
              <i className="fa fa-arrow-down" />
            </button>
          )}
          <button
            type="button"
            className="report-metric-card-btn report-metric-card-btn-danger"
            onClick={() => onRemove(index)}
            title="Remove metric">
            <i className="fa fa-trash" />
          </button>
        </div>
      </div>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Input
          layout="horizontal"
          label="Label"
          value={card.label}
          onChange={(e: any) => onUpdate(index, { label: e.target.value })}
          placeholder="e.g., Total Revenue"
        />
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          layout="horizontal"
          label="Column"
          value={card.column || undefined}
          onChange={(value: any) => onUpdate(index, { column: value })}
          placeholder="Select column">
          {map(columns, (col: any) => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type
            <Select.Option key={col.name} value={col.name}>
              {col.name}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          layout="horizontal"
          label="Aggregation"
          value={card.aggregation}
          onChange={(value: any) => onUpdate(index, { aggregation: value })}>
          {map(AGGREGATION_OPTIONS, (opt) => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          layout="horizontal"
          label="Format"
          value={card.format}
          onChange={(value: any) => onUpdate(index, { format: value })}>
          {map(FORMAT_OPTIONS, (opt) => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <InputNumber
          layout="horizontal"
          label="Decimal Places"
          value={card.decimalPlaces}
          min={0}
          max={10}
          onChange={(value: any) => onUpdate(index, { decimalPlaces: value })}
        />
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
        <Switch
          // @ts-expect-error ts-migrate(2322) FIXME
          id={`conditional-formatting-${index}`}
          // @ts-expect-error ts-migrate(2322) FIXME
          defaultChecked={card.conditionalFormatting}
          // @ts-expect-error ts-migrate(2322) FIXME
          onChange={(checked: any) => onUpdate(index, { conditionalFormatting: checked })}>
          Conditional Colors
        </Switch>
      </Section>

      {card.conditionalFormatting && (
        <div className="report-conditional-colors">
          {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
          <Section>
            <div className="report-color-picker-row">
              <span className="report-color-label">Positive:</span>
              <ColorPicker
                // @ts-expect-error ts-migrate(2322) FIXME
                color={card.positiveColor}
                // @ts-expect-error ts-migrate(2322) FIXME
                onChange={(color: any) => onUpdate(index, { positiveColor: color })}
              />
              <span className="report-color-label" style={{ marginLeft: 16 }}>Negative:</span>
              <ColorPicker
                // @ts-expect-error ts-migrate(2322) FIXME
                color={card.negativeColor}
                // @ts-expect-error ts-migrate(2322) FIXME
                onChange={(color: any) => onUpdate(index, { negativeColor: color })}
              />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

export default function HeaderSettings({ options, data, onOptionsChange }: any) {
  const metricCards: MetricCard[] = options.metricCards || [];
  const columns = data.columns || [];

  function addMetricCard() {
    const newCard: MetricCard = {
      ...DEFAULT_METRIC_CARD,
      id: generateId(),
    };
    onOptionsChange({ metricCards: [...metricCards, newCard] });
  }

  function updateMetricCard(index: number, updates: Partial<MetricCard>) {
    const updated = [...metricCards];
    updated[index] = { ...updated[index], ...updates };
    onOptionsChange({ metricCards: updated });
  }

  function removeMetricCard(index: number) {
    const updated = metricCards.filter((_: any, i: number) => i !== index);
    onOptionsChange({ metricCards: updated });
  }

  function moveMetricCard(index: number, direction: number) {
    const updated = [...metricCards];
    const target = index + direction;
    if (target < 0 || target >= updated.length) return;
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onOptionsChange({ metricCards: updated });
  }

  return (
    <React.Fragment>
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        {/* @ts-expect-error ts-migrate(2746) FIXME */}
        <Section.Title>Report Header Metrics</Section.Title>
        <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 12px" }}>
          Add metric cards that summarize your data above the detail table.
        </p>
      </Section>

      {map(metricCards, (card, index) => (
        <MetricCardEditor
          key={card.id || `metric-${index}`}
          card={card}
          index={index}
          columns={columns}
          onUpdate={updateMetricCard}
          onRemove={removeMetricCard}
          onMoveUp={(i) => moveMetricCard(i, -1)}
          onMoveDown={(i) => moveMetricCard(i, 1)}
          isFirst={index === 0}
          isLast={index === metricCards.length - 1}
        />
      ))}

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <button
          type="button"
          className="report-add-metric-btn"
          onClick={addMetricCard}
          data-test="AddMetricCard">
          <i className="fa fa-plus" /> Add Metric Card
        </button>
      </Section>
    </React.Fragment>
  );
}

HeaderSettings.propTypes = EditorPropTypes;
