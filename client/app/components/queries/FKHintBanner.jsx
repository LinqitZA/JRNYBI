import React, { useState, useCallback, useEffect } from "react";
import PropTypes from "prop-types";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const FK_SHORTCUT_LABEL = isMac ? "⌘⇧L" : "Ctrl+Shift+L";
const DISMISS_KEY = "jrnybi:fk-hint-dismissed";

/**
 * FKHintBanner - Shows a non-intrusive hint when FK columns are detected
 * in the SELECT clause of the query editor.  Tells the user they can press
 * Ctrl+Shift+L (Cmd+Shift+L on Mac) to resolve FK columns to human-readable
 * display fields with automatic JOIN generation, or click "Resolve now" to
 * resolve all detected FK columns in one action.
 *
 * Renders below the editor, in the same slot as SelectStarHintBanner and
 * ViewSuggestionBanner.  Automatically hides when no FK columns remain.
 * Dismissal is remembered in localStorage so the banner doesn't reappear.
 */
export default function FKHintBanner({ fkMatches, onResolve }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "true";
    } catch (e) {
      return false;
    }
  });

  const handleResolve = useCallback(() => {
    if (onResolve) onResolve();
  }, [onResolve]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch (e) {
      // localStorage may not be available
    }
  }, []);

  const matchCount = fkMatches ? fkMatches.length : 0;

  // Don't render if dismissed, or if no FK columns detected
  if (dismissed || matchCount === 0) return null;

  // Summarize: show the first FK column name(s)
  const uniqueColumns = [];
  const seen = new Set();
  for (const m of fkMatches) {
    const key = m.fkInfo ? m.fkInfo.columnName : "";
    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueColumns.push(key);
    }
  }

  const isMultiple = uniqueColumns.length > 1;

  // Detect multiple FK columns referencing the same target table
  const targetTableCounts = {};
  for (const m of fkMatches) {
    const target = m.fkInfo && m.fkInfo.edge ? m.fkInfo.edge.relatedTable : null;
    if (target) {
      targetTableCounts[target] = (targetTableCounts[target] || 0) + 1;
    }
  }
  const multiRefTargets = Object.entries(targetTableCounts)
    .filter(([, count]) => count > 1)
    .map(([table, count]) => ({ table, count }));

  return (
    <div className="fk-hint-banner" role="status" aria-live="polite">
      <i className="fa fa-link fk-hint-icon" aria-hidden="true" />
      <span className="fk-hint-text">
        {"FK column"}
        {isMultiple ? "s" : ""}
        {" detected"}
        {!isMultiple && uniqueColumns[0] && (
          <>
            {": "}
            <code>{uniqueColumns[0]}</code>
          </>
        )}
        {isMultiple && (
          <>
            {": "}
            <strong>{uniqueColumns.length} columns</strong>
          </>
        )}
        {" — press "}
        <kbd>{FK_SHORTCUT_LABEL}</kbd>
        {" to resolve to display field and auto-add JOIN"}
      </span>
      <button type="button" className="fk-hint-action" onClick={handleResolve}>
        Resolve now
      </button>
      <button
        type="button"
        className="fk-hint-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss hint"
        title="Dismiss">
        &times;
      </button>
      {multiRefTargets.length > 0 && (
        <div className="fk-hint-multi-ref">
          {multiRefTargets.map(({ table, count }) => (
            <span key={table} className="fk-multi-ref-note">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" />{" "}
              Note: {count} columns reference <strong>{table}</strong> — use separate aliases for each
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

FKHintBanner.propTypes = {
  fkMatches: PropTypes.arrayOf(
    PropTypes.shape({
      row: PropTypes.number,
      startCol: PropTypes.number,
      endCol: PropTypes.number,
      label: PropTypes.string,
      fkInfo: PropTypes.object,
    })
  ),
  onResolve: PropTypes.func,
};

FKHintBanner.defaultProps = {
  fkMatches: [],
  onResolve: null,
};
