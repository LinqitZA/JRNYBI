import { map } from "lodash";
import React from "react";
import { Section, Select, InputNumber } from "@/components/visualizations/editor";
import { EditorPropTypes } from "@/visualizations/prop-types";

const ALLOWED_ITEM_PER_PAGE = [5, 10, 15, 20, 25, 50, 100, 150, 200, 250, 500];

export default function GridSettings({ options, onOptionsChange, data }: any) {
  const detailQuery = options.detailQuery || {};
  const columnNames = (data && data.columns) ? map(data.columns, (c: any) => c.name) : [];

  function updateDetail(changes: any) {
    onOptionsChange({ detailQuery: { ...detailQuery, ...changes } });
  }

  return (
    <React.Fragment>
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          label="Items per page"
          data-test="Table.ItemsPerPage"
          defaultValue={options.itemsPerPage}
          onChange={(itemsPerPage: any) => onOptionsChange({ itemsPerPage })}>
          {map(ALLOWED_ITEM_PER_PAGE, value => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message
            <Select.Option key={`ipp${value}`} value={value} data-test={`Table.ItemsPerPage.${value}`}>
              {value}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {/* Feature #210 — expandable detail rows */}
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <InputNumber
          label="Detail query ID (optional)"
          data-test="Table.DetailQuery.QueryId"
          defaultValue={detailQuery.queryId}
          min={1}
          onChange={(queryId: any) => updateDetail({ queryId: queryId || null })}
        />
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          label="Row key column"
          data-test="Table.DetailQuery.KeyColumn"
          allowClear
          placeholder="Pick the column used as the detail-query parameter"
          defaultValue={detailQuery.keyColumn}
          onChange={(keyColumn: any) => updateDetail({ keyColumn: keyColumn || null })}>
          {map(columnNames, (name: string) => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message
            <Select.Option key={name} value={name} data-test={`Table.DetailQuery.KeyColumn.${name}`}>
              {name}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          ))}
        </Select>
      </Section>
    </React.Fragment>
  );
}

GridSettings.propTypes = EditorPropTypes;
