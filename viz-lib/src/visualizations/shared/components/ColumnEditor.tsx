import { map } from "lodash";
import React from "react";
import { useDebouncedCallback } from "use-debounce";
import * as Grid from "antd/lib/grid";
import { Section, Select, Input, Checkbox, TextAlignmentSelect } from "@/components/visualizations/editor";

import ColumnTypes from "../columns";
import ConditionalFormattingEditor from "@/visualizations/table/Editor/ConditionalFormattingEditor";
import { Rule } from "@/visualizations/shared/conditionalFormatting";

type Column = {
  name: string;
  title?: string;
  visible?: boolean;
  alignContent?: "left" | "center" | "right";
  displayAs?: any;
  description?: string;
  allowSearch?: boolean;
  pinned?: "none" | "left" | "right";
  // Feature #207 — conditional formatting rules. Evaluated top-to-bottom,
  // first match wins. Implementation in shared/conditionalFormatting.ts.
  conditionalFormatting?: Rule[];
};

type ColumnEditorProps = {
  column: Column;
  onChange?: (changes: any) => any;
  variant: "table" | "details";
  showSearch?: boolean;
  testPrefix?: string;
};

export default function ColumnEditor({
  column,
  onChange,
  variant,
  showSearch = variant === "table",
  testPrefix,
}: ColumnEditorProps) {
  function handleChange(changes: any) {
    if (onChange) {
      onChange({ ...column, ...changes });
    }
  }

  const [handleChangeDebounced] = useDebouncedCallback(handleChange, 200);

  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const AdditionalOptions = ColumnTypes[column.displayAs].Editor || null;

  const cssClass = `${variant}-visualization-editor-column`;
  const dataTestPrefix = testPrefix || `${variant === "table" ? "Table" : "Details"}.Column.${column.name}`;

  return (
    <div className={cssClass}>
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        {/* @ts-expect-error ts-migrate(2322) FIXME: Type '{ children: Element[]; gutter: number; type:... Remove this comment to see the full error message */}
        <Grid.Row gutter={15} type="flex" align="middle">
          <Grid.Col span={16}>
            <Input
              data-test={`${dataTestPrefix}.Title`}
              defaultValue={column.title}
              onChange={(event: any) => handleChangeDebounced({ title: event.target.value })}
            />
          </Grid.Col>
          <Grid.Col span={8}>
            <TextAlignmentSelect
              data-test={`${dataTestPrefix}.TextAlignment`}
              defaultValue={column.alignContent}
              onChange={(event: any) => handleChange({ alignContent: event.target.value })}
            />
          </Grid.Col>
        </Grid.Row>
      </Section>

      {showSearch && (
        /* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */
        <Section>
          <Checkbox
            data-test={`${dataTestPrefix}.UseForSearch`}
            defaultChecked={column.allowSearch}
            onChange={event => handleChange({ allowSearch: event.target.checked })}>
            Use for search
          </Checkbox>
        </Section>
      )}

      {variant === "table" &&
        // Feature #209 — pin column to the left or right edge of the grid
        (() => {
          const SelectAny = Select as any;
          return (
            // @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message
            <Section>
              <SelectAny
                label="Pinned"
                data-test={`${dataTestPrefix}.Pinned`}
                defaultValue={column.pinned || "none"}
                onChange={(pinned: any) => handleChange({ pinned })}>
                <SelectAny.Option key="none" value="none" data-test={`${dataTestPrefix}.Pinned.none`}>
                  None
                </SelectAny.Option>
                <SelectAny.Option key="left" value="left" data-test={`${dataTestPrefix}.Pinned.left`}>
                  Left
                </SelectAny.Option>
                <SelectAny.Option key="right" value="right" data-test={`${dataTestPrefix}.Pinned.right`}>
                  Right
                </SelectAny.Option>
              </SelectAny>
            </Section>
          );
        })()}

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Input
          label="Description"
          data-test={`${dataTestPrefix}.Description`}
          defaultValue={column.description}
          onChange={(event: any) => handleChangeDebounced({ description: event.target.value })}
        />
      </Section>

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          label="Display as:"
          data-test={`${dataTestPrefix}.DisplayAs`}
          defaultValue={column.displayAs}
          onChange={(displayAs: any) => handleChange({ displayAs })}>
          {map(ColumnTypes, ({ friendlyName }, key) => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message
            <Select.Option key={key} data-test={`${dataTestPrefix}.DisplayAs.${key}`}>
              {friendlyName}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {AdditionalOptions && <AdditionalOptions column={column} onChange={handleChange} />}

      {variant === "table" && (
        /* Feature #207 — Conditional formatting per column.
           Mounted last so per-displayAs options stay grouped at top. */
        // @ts-expect-error Section children typing
        <Section>
          <ControlLabelHeading>Conditional formatting</ControlLabelHeading>
          <ConditionalFormattingEditor
            rules={column.conditionalFormatting}
            onChange={(rules: Rule[]) => handleChange({ conditionalFormatting: rules })}
            testPrefix={`${dataTestPrefix}.CondFmt`}
          />
        </Section>
      )}
    </div>
  );
}

function ControlLabelHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#1f2937" }}>
      {children}
    </div>
  );
}

ColumnEditor.defaultProps = {
  onChange: () => {},
};
