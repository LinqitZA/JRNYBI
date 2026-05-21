import React, { useState, useCallback, useEffect } from "react";
import PropTypes from "prop-types";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const FK_SHORTCUT_LABEL = isMac ? "⌘." : "Ctrl+.";
const DISMISS_KEY = "jrnybi:fk-hint-dismissed";

/**
 * FKHintBanner - Shows a non-intrusive hint when FK columns are detected
 * in the SELECT clause of the query editor.  Tells the user they can press
 * Ctrl+. (Cmd+. on Mac) to resolve FK columns to human-readable display
 * fields with automatic JOIN generation.
 *
 * Renders below the editor, in the same slot as SelectStarHintBanner and
 * ViewSuggestionBanner.  Automatically hides when no FK columns remain.
 * Dismissal is remembered in localStorage so the banner doesn't reappear.
 */
export default function FKHintBanner({ fkMatches }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "true";
    } catch (e) {
      return false;
    }
  });

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
      <button
        type="button"
        className="fk-hint-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss hint"
        title="Dismiss">
        &times;
      </button>
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
};

FKHintBanner.defaultProps = {
  fkMatches: [],
};
