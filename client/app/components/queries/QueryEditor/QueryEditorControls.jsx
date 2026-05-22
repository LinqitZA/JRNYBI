import { isFunction, map, filter, fromPairs, noop } from "lodash";
import React, { useEffect } from "react";
import PropTypes from "prop-types";
import Tooltip from "@/components/Tooltip";
import Button from "antd/lib/button";
import Select from "antd/lib/select";
import KeyboardShortcuts, { humanReadableShortcut } from "@/services/KeyboardShortcuts";

import AutocompleteToggle from "./AutocompleteToggle";
import "./QueryEditorControls.less";
import AutoLimitCheckbox from "@/components/queries/QueryEditor/AutoLimitCheckbox";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";
const shift = isMac ? "⇧" : "Shift";

const EDITOR_SHORTCUTS_TOOLTIP = (
  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
    <div><b>Editor Shortcuts</b></div>
    <div>{mod}+{shift}+X &mdash; Expand SELECT *</div>
    <div>{mod}+{shift}+J &mdash; Resolve FK column</div>
    <div>{mod}+{shift}+F &mdash; Format query</div>
    <div>{mod}+Enter &mdash; Execute query</div>
    <div>Esc &mdash; Exit editor</div>
  </div>
);

export function ButtonTooltip({ title, shortcut, ...props }) {
  shortcut = humanReadableShortcut(shortcut, 1); // show only primary shortcut
  title =
    title && shortcut ? (
      <React.Fragment>
        {title} (<i>{shortcut}</i>)
      </React.Fragment>
    ) : (
      title || shortcut
    );
  return <Tooltip placement="top" title={title} {...props} />;
}

ButtonTooltip.propTypes = {
  title: PropTypes.node,
  shortcut: PropTypes.string,
};

ButtonTooltip.defaultProps = {
  title: null,
  shortcut: null,
};

export default function EditorControl({
  addParameterButtonProps,
  formatButtonProps,
  saveButtonProps,
  executeButtonProps,
  autocompleteToggleProps,
  autoLimitCheckboxProps,
  dataSourceSelectorProps,
}) {
  useEffect(() => {
    const buttons = filter(
      [addParameterButtonProps, formatButtonProps, saveButtonProps, executeButtonProps],
      b => b.shortcut && isFunction(b.onClick)
    );
    if (buttons.length > 0) {
      const shortcuts = fromPairs(map(buttons, b => [b.shortcut, b.disabled ? noop : b.onClick]));
      KeyboardShortcuts.bind(shortcuts);
      return () => {
        KeyboardShortcuts.unbind(shortcuts);
      };
    }
  }, [addParameterButtonProps, formatButtonProps, saveButtonProps, executeButtonProps]);

  return (
    <div className="query-editor-controls">
      {addParameterButtonProps !== false && (
        <ButtonTooltip title={addParameterButtonProps.title} shortcut={addParameterButtonProps.shortcut}>
          <Button
            className="query-editor-controls-button m-r-5"
            disabled={addParameterButtonProps.disabled}
            onClick={addParameterButtonProps.onClick}>
            {"{{"}&nbsp;{"}}"}
          </Button>
        </ButtonTooltip>
      )}
      {formatButtonProps !== false && (
        <ButtonTooltip title={formatButtonProps.title} shortcut={formatButtonProps.shortcut}>
          <Button
            className="query-editor-controls-button m-r-5"
            disabled={formatButtonProps.disabled}
            onClick={formatButtonProps.onClick}>
            <span className="zmdi zmdi-format-indent-increase" />
            {formatButtonProps.text}
          </Button>
        </ButtonTooltip>
      )}
      <Tooltip placement="top" title={EDITOR_SHORTCUTS_TOOLTIP} overlayStyle={{ maxWidth: 280 }}>
        <Button
          className="query-editor-controls-button m-r-5"
          size="small"
          style={{ fontSize: 12, padding: "0 6px", opacity: 0.65 }}>
          <span className="fa fa-keyboard-o" />
        </Button>
      </Tooltip>
      {autocompleteToggleProps !== false && (
        <AutocompleteToggle
          available={autocompleteToggleProps.available}
          enabled={autocompleteToggleProps.enabled}
          onToggle={autocompleteToggleProps.onToggle}
        />
      )}
      {autoLimitCheckboxProps !== false && <AutoLimitCheckbox {...autoLimitCheckboxProps} />}
      {dataSourceSelectorProps === false && <span className="query-editor-controls-spacer" />}
      {dataSourceSelectorProps !== false && (
        <Select
          className="w-100 flex-fill datasource-small"
          disabled={dataSourceSelectorProps.disabled}
          value={dataSourceSelectorProps.value}
          onChange={dataSourceSelectorProps.onChange}>
          {map(dataSourceSelectorProps.options, option => (
            <Select.Option key={`option-${option.value}`} value={option.value}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      )}
      {saveButtonProps !== false && (
        <ButtonTooltip title={saveButtonProps.title} shortcut={saveButtonProps.shortcut}>
          <Button
            className="query-editor-controls-button m-l-5"
            disabled={saveButtonProps.disabled}
            loading={saveButtonProps.loading}
            onClick={saveButtonProps.onClick}
            data-test="SaveButton">
            {!saveButtonProps.loading && <span className="fa fa-floppy-o" />}
            {saveButtonProps.text}
          </Button>
        </ButtonTooltip>
      )}
      {executeButtonProps !== false && (
        <ButtonTooltip title={executeButtonProps.title} shortcut={executeButtonProps.shortcut}>
          <Button
            className="query-editor-controls-button m-l-5"
            type="primary"
            disabled={executeButtonProps.disabled}
            onClick={executeButtonProps.onClick}
            data-test="ExecuteButton">
            <span className="zmdi zmdi-play" />
            {executeButtonProps.text}
          </Button>
        </ButtonTooltip>
      )}
    </div>
  );
}

const ButtonPropsPropType = PropTypes.oneOfType([
  PropTypes.bool, // `false` to hide button
  PropTypes.shape({
    title: PropTypes.node,
    disabled: PropTypes.bool,
    loading: PropTypes.bool,
    onClick: PropTypes.func,
    text: PropTypes.node,
    shortcut: PropTypes.string,
  }),
]);

EditorControl.propTypes = {
  addParameterButtonProps: ButtonPropsPropType,
  formatButtonProps: ButtonPropsPropType,
  saveButtonProps: ButtonPropsPropType,
  executeButtonProps: ButtonPropsPropType,
  autocompleteToggleProps: PropTypes.oneOfType([
    PropTypes.bool, // `false` to hide
    PropTypes.shape({
      available: PropTypes.bool,
      enabled: PropTypes.bool,
      onToggle: PropTypes.func,
    }),
  ]),
  autoLimitCheckboxProps: PropTypes.oneOfType([
    PropTypes.bool, // `false` to hide
    PropTypes.shape(AutoLimitCheckbox.propTypes),
  ]),
  dataSourceSelectorProps: PropTypes.oneOfType([
    PropTypes.bool, // `false` to hide
    PropTypes.shape({
      disabled: PropTypes.bool,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      options: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
          label: PropTypes.node,
        })
      ),
      onChange: PropTypes.func,
    }),
  ]),
};

EditorControl.defaultProps = {
  addParameterButtonProps: false,
  formatButtonProps: false,
  saveButtonProps: false,
  executeButtonProps: false,
  autocompleteToggleProps: false,
  autoLimitCheckboxProps: false,
  dataSourceSelectorProps: false,
};
