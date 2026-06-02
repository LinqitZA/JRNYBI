import { map } from "lodash";
import React from "react";
import { Section, Select, InputNumber, Switch } from "@/components/visualizations/editor";
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

      {/* Feature #211 — server-side virtualisation toggle.
         * Recommended for queries returning 100k+ rows. When enabled, the
         * Table viz uses AG Grid's infinite row model and pulls rows from
         * POST /api/query_results/<id>/page one block at a time. Below 100k
         * the default client-side pagination is typically faster. */}
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
        <Switch
          /* @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'never'. */
          id="table-enable-server-side-virtualization"
          data-test="Table.EnableServerSideVirtualization"
          /* @ts-expect-error ts-migrate(2322) FIXME: Type 'any' is not assignable to type 'never'. */
          defaultChecked={options.enableServerSideVirtualization}
          /* @ts-expect-error ts-migrate(2322) FIXME: Type 'any' is not assignable to type 'never'. */
          onChange={(enableServerSideVirtualization: any) =>
            onOptionsChange({ enableServerSideVirtualization })
          }>
          Enable server-side virtualization (recommended for 100k+ rows)
        </Switch>
      </Section>

      {options.enableServerSideVirtualization && (
        // @ts-expect-error ts-migrate(2745) FIXME: children expects never
        <Section>
          <InputNumber
            label="Server-side page size"
            data-test="Table.ServerSidePageSize"
            defaultValue={options.serverSidePageSize || 200}
            min={25}
            max={5000}
            step={25}
            onChange={(serverSidePageSize: any) =>
              onOptionsChange({ serverSidePageSize: Number(serverSidePageSize) || 200 })
            }
          />
        </Section>
      )}

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
