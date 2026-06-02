/**
 * KPI Card v2 — Value tab (feature #192)
 *
 * Same fields as the legacy GeneralSettings but renamed to "Value" so the new
 * tabbed UI groups headline-number config separately from comparison /
 * sparkline / threshold settings. Backwards compatible with existing saved
 * widgets — every field name and shape matches the old GeneralSettings.
 */
import { map } from "lodash";
import React from "react";
import { Section, Select, Input, InputNumber, Switch } from "@/components/visualizations/editor";
import { EditorPropTypes } from "@/visualizations/prop-types";

export default function ValueSettings({ options, data, visualizationName, onOptionsChange }: any) {
  return (
    <React.Fragment>
      {/* @ts-expect-error */}
      <Section>
        <Input
          layout="horizontal"
          label="KPI Label"
          data-test="Counter.Value.Label"
          defaultValue={options.counterLabel}
          placeholder={visualizationName}
          onChange={(e: any) => onOptionsChange({ counterLabel: e.target.value })}
        />
      </Section>

      {/* @ts-expect-error */}
      <Section>
        <Select
          layout="horizontal"
          label="Value Column"
          data-test="Counter.Value.ValueColumn"
          defaultValue={options.counterColName}
          disabled={options.countRow}
          onChange={(counterColName: any) => onOptionsChange({ counterColName })}>
          {map(data.columns, (col: any) => (
            // @ts-expect-error
            <Select.Option key={col.name} data-test={"Counter.Value.ValueColumn." + col.name}>
              {col.name}
              {/* @ts-expect-error */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* @ts-expect-error */}
      <Section>
        <InputNumber
          layout="horizontal"
          label="Value Row Number"
          data-test="Counter.Value.ValueRowNumber"
          defaultValue={options.rowNumber}
          disabled={options.countRow}
          onChange={(rowNumber: any) => onOptionsChange({ rowNumber })}
        />
      </Section>

      {/* @ts-expect-error */}
      <Section>
        {/* @ts-expect-error */}
        <Switch
          data-test="Counter.Value.CountRows"
          // @ts-expect-error
          defaultChecked={options.countRow}
          // @ts-expect-error
          onChange={(countRow: any) => onOptionsChange({ countRow })}>
          Count Rows (use total row count as the value)
        </Switch>
      </Section>
    </React.Fragment>
  );
}

ValueSettings.propTypes = EditorPropTypes;
