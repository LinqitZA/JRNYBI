import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const EXPAND_SHORTCUT_LABEL = isMac ? "⌘⇧E" : "Ctrl+Shift+E";

/**
 * SelectStarHintBanner - Shows a non-intrusive hint when SELECT * FROM <table>
 * patterns are detected in the query editor.  Tells the user they can press
 * Ctrl+Shift+E (Cmd+Shift+E on Mac) to expand * to the full column list,
 * or click the "Expand" button for one-click expansion.
 *
 * Renders below the editor, above the controls bar, in the same slot as
 * ViewSuggestionBanner.  Automatically hides when no SELECT * patterns
 * remain (e.g. after the user expands or deletes the query).
 */
export default function SelectStarHintBanner({ selectStarMatches, onExpand }) {
  const [dismissed, setDismissed] = useState(false);

  const handleExpand = useCallback(() => {
    if (onExpand) onExpand();
  }, [onExpand]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // Reset dismissed state when matches change from 0 -> N (new SELECT * typed)
  const matchCount = selectStarMatches ? selectStarMatches.length : 0;
  React.useEffect(() => {
    if (matchCount > 0) {
      setDismissed(false);
    }
  }, [matchCount]);

  if (dismissed || !selectStarMatches || selectStarMatches.length === 0) return null;

  // Summarize: "SELECT * from reporting.v_sales_orders (14 columns)"
  const summaryParts = selectStarMatches.map(m => {
    const colText = m.columnCount > 0 ? ` (${m.columnCount} columns)` : "";
    return `${m.fullTableName || m.tableName}${colText}`;
  });

  const isMultiple = selectStarMatches.length > 1;

  return (
    <div className="select-star-hint-banner" role="status" aria-live="polite">
      <i className="fa fa-lightbulb-o select-star-hint-icon" aria-hidden="true" />
      <span className="select-star-hint-text">
        {"SELECT * detected"}
        {!isMultiple && summaryParts[0] && (
          <>
            {" from "}
            <code>{summaryParts[0]}</code>
          </>
        )}
        {isMultiple && (
          <>
            {" in "}
            <strong>{selectStarMatches.length} tables</strong>
          </>
        )}
        {" — "}
        <kbd>{EXPAND_SHORTCUT_LABEL}</kbd>
        {" to expand columns"}
      </span>
      <button type="button" className="select-star-hint-action" onClick={handleExpand}>
        Expand now
      </button>
      <button
        type="button"
        className="select-star-hint-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss hint"
        title="Dismiss">
        &times;
      </button>
    </div>
  );
}

SelectStarHintBanner.propTypes = {
  selectStarMatches: PropTypes.arrayOf(
    PropTypes.shape({
      row: PropTypes.number,
      col: PropTypes.number,
      tableName: PropTypes.string,
      fullTableName: PropTypes.string,
      columnCount: PropTypes.number,
    })
  ),
  onExpand: PropTypes.func,
};

SelectStarHintBanner.defaultProps = {
  selectStarMatches: [],
  onExpand: null,
};
