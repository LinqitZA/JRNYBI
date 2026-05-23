import React, { useEffect, useMemo, useState, useCallback, useImperativeHandle } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import ace from "ace-builds";
import { AceEditor, snippetsModule, updateSchemaCompleter, getSchemaRawData, getFKGraphData } from "./ace";
import { detectFKAtCursor, applyFKResolution, findFKColumnsInSelect } from "./fkResolution";
import { SQL_SNIPPETS, JRNY_TEMPLATES, expandSelectStar, findSelectStarPositions } from "./querySnippets";
import { srNotify } from "@/lib/accessibility";
import { SchemaItemType } from "@/components/queries/SchemaBrowser";
import resizeObserver from "@/services/resizeObserver";
import QuerySnippet from "@/services/query-snippet";

import QueryEditorControls from "./QueryEditorControls";
import "./index.less";

const editorProps = { $blockScrolling: Infinity };

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const EXPAND_SHORTCUT_LABEL = isMac ? "⌘⇧X" : "Ctrl+Shift+X";

const QueryEditor = React.forwardRef(function(
  { className, syntax, value, autocompleteEnabled, schema, onChange, onSelectionChange, onSelectStarDetected, onFKDetected, ...props },
  ref
) {
  const [container, setContainer] = useState(null);
  const [editorRef, setEditorRef] = useState(null);

  // For some reason, value for AceEditor should be managed in this way - otherwise it goes berserk when selecting text
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleChange = useCallback(
    str => {
      setCurrentValue(str);
      onChange(str);
    },
    [onChange]
  );

  const editorOptions = useMemo(
    () => ({
      behavioursEnabled: true,
      enableSnippets: true,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: autocompleteEnabled,
      autoScrollEditorIntoView: true,
    }),
    [autocompleteEnabled]
  );

  useEffect(() => {
    if (editorRef) {
      const editorId = editorRef.editor.id;
      const editor = editorRef.editor;
      updateSchemaCompleter(editorId, schema);

      // FK column markers: dotted underline on FK columns in SELECT clause
      const Range = ace.acequire("ace/range").Range;
      let markerIds = [];
      let selectStarMarkerIds = [];
      let selectStarGutterRows = [];
      let markerTimeout = null;

      function updateFKMarkers() {
        const rawSchema = getSchemaRawData(editorId);
        const fkGraph = getFKGraphData(editorId);

        // Remove old FK markers
        markerIds.forEach(id => editor.session.removeMarker(id));
        markerIds = [];

        if (!rawSchema || !fkGraph) {
          if (onFKDetected) onFKDetected([]);
          return;
        }

        try {
          const fkCols = findFKColumnsInSelect(editor, rawSchema, fkGraph);
          fkCols.forEach(marker => {
            const range = new Range(marker.row, marker.startCol, marker.row, marker.endCol);
            const id = editor.session.addMarker(range, "fk-resolvable-marker", "text", false);
            markerIds.push(id);
          });

          // Notify parent about detected FK columns (for the hint banner)
          if (onFKDetected) {
            onFKDetected(fkCols);
          }
        } catch (e) {
          // Never let marker logic break the editor
          if (onFKDetected) onFKDetected([]);
        }
      }

      function updateSelectStarMarkers() {
        const rawSchema = getSchemaRawData(editorId);

        // Remove old SELECT * markers
        selectStarMarkerIds.forEach(id => editor.session.removeMarker(id));
        selectStarMarkerIds = [];

        // Remove old gutter decorations
        selectStarGutterRows.forEach(row =>
          editor.session.removeGutterDecoration(row, "select-star-gutter")
        );
        selectStarGutterRows = [];

        if (!rawSchema) {
          if (onSelectStarDetected) onSelectStarDetected([]);
          return;
        }

        try {
          const queryText = editor.session.getValue();
          const matches = findSelectStarPositions(queryText, rawSchema);

          matches.forEach(m => {
            // Add highlight marker on the * character
            const range = new Range(m.row, m.col, m.row, m.col + 1);
            const id = editor.session.addMarker(range, "select-star-marker", "text", false);
            selectStarMarkerIds.push(id);

            // Add gutter lightbulb decoration
            editor.session.addGutterDecoration(m.row, "select-star-gutter");
            selectStarGutterRows.push(m.row);
          });

          // Notify parent about detected SELECT * patterns (for the banner)
          if (onSelectStarDetected) {
            onSelectStarDetected(matches);
          }
        } catch (e) {
          // Never let marker logic break the editor
          if (onSelectStarDetected) onSelectStarDetected([]);
        }
      }

      // Initial marker update
      updateFKMarkers();
      updateSelectStarMarkers();

      // Update markers on text changes (debounced)
      function onEditorChange() {
        if (markerTimeout) clearTimeout(markerTimeout);
        markerTimeout = setTimeout(() => {
          updateFKMarkers();
          updateSelectStarMarkers();
        }, 500);
      }

      editor.session.on("change", onEditorChange);

      return () => {
        updateSchemaCompleter(editorId, null);
        markerIds.forEach(id => editor.session.removeMarker(id));
        selectStarMarkerIds.forEach(id => editor.session.removeMarker(id));
        selectStarGutterRows.forEach(row =>
          editor.session.removeGutterDecoration(row, "select-star-gutter")
        );
        editor.session.off("change", onEditorChange);
        if (markerTimeout) clearTimeout(markerTimeout);
      };
    }
  }, [schema, editorRef]);

  useEffect(() => {
    function resize() {
      if (editorRef) {
        editorRef.editor.resize();
      }
    }

    if (container) {
      resize();
      const unwatch = resizeObserver(container, resize);
      return unwatch;
    }
  }, [container, editorRef]);

  const handleSelectionChange = useCallback(
    selection => {
      const rawSelectedQueryText = editorRef.editor.session.doc.getTextRange(selection.getRange());
      const selectedQueryText = rawSelectedQueryText.length > 1 ? rawSelectedQueryText : null;
      onSelectionChange(selectedQueryText);
    },
    [editorRef, onSelectionChange]
  );

  // Bind Ctrl+Shift+X via capture-phase listener (Mousetrap bubble-phase doesn't fire inside JRNY ERP iframe)
  useEffect(() => {
    if (editorRef) {
      const editor = editorRef.editor;
      const handler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "X") {
          if (!editor.isFocused()) return;
          e.preventDefault();
          e.stopPropagation();
          editor.commands.exec("expandSelectStar", editor);
        }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }
  }, [editorRef]);

  // Bind Ctrl+Shift+L via capture-phase listener (Ctrl+. doesn't work inside JRNY ERP iframe)
  useEffect(() => {
    if (editorRef) {
      const editor = editorRef.editor;
      const handler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "L" || e.key === "l")) {
          if (!editor.isFocused()) return;
          e.preventDefault();
          e.stopPropagation();
          editor.commands.exec("resolveFKColumn", editor);
        }
      };
      document.addEventListener("keydown", handler, true);
      return () => document.removeEventListener("keydown", handler, true);
    }
  }, [editorRef]);

  const initEditor = useCallback(editor => {
    // Release Cmd/Ctrl+L to the browser
    editor.commands.bindKey({ win: "Ctrl+L", mac: "Cmd+L" }, null);

    // Release Cmd/Ctrl+Shift+F for format query action
    editor.commands.bindKey({ win: "Ctrl+Shift+F", mac: "Cmd+Shift+F" }, null);

    // Release Cmd/Ctrl+Shift+X so capture-phase listener can handle it
    editor.commands.bindKey({ win: "Ctrl+Shift+X", mac: "Cmd+Shift+X" }, null);

    // Release Ctrl+Shift+L / Cmd+Shift+L so capture-phase listener can handle it
    editor.commands.bindKey({ win: "Ctrl-Shift-L", mac: "Cmd-Shift-L" }, null);

    // Release Ctrl+. / Cmd+. from Ace (original FK shortcut, now Ctrl+Shift+L) to prevent
    // Ace from intercepting and allow browser/parent frame to handle normally
    editor.commands.bindKey({ win: "Ctrl-.", mac: "Cmd-." }, null);

    // Release Ctrl+P for open new parameter dialog
    editor.commands.bindKey({ win: "Ctrl+P", mac: null }, null);
    // Lineup only mac
    editor.commands.bindKey({ win: null, mac: "Ctrl+P" }, "golineup");

    // Esc for exiting
    editor.commands.bindKey({ win: "Esc", mac: "Esc" }, () => {
      editor.blur();
    });

    let notificationCleanup = null;
    editor.on("focus", () => {
      notificationCleanup = srNotify({
        text: "You've entered the SQL editor. To exit press the ESC key.",
        politeness: "assertive",
      });
    });

    editor.on("blur", () => {
      if (notificationCleanup) {
        notificationCleanup();
      }
    });

    // FK resolution: registered as named command (keyboard shortcut via capture-phase listener above)
    editor.commands.addCommand({
      name: "resolveFKColumn",
      bindKey: null, // Key released to capture-phase listener to avoid browser interception
      exec: ed => {
        const rawSchema = getSchemaRawData(ed.id);
        const fkGraph = getFKGraphData(ed.id);
        if (!rawSchema || !fkGraph) return;
        const fkInfo = detectFKAtCursor(ed, rawSchema, fkGraph);
        if (fkInfo) {
          applyFKResolution(ed, fkInfo);
        }
      },
    });

    // Resolve ALL FK columns at once: collects all FK columns up front, then iterates
    // bottom-to-top so position shifts from earlier resolutions don't affect later ones.
    editor.commands.addCommand({
      name: "resolveAllFKColumns",
      bindKey: null,
      exec: ed => {
        const rawSchema = getSchemaRawData(ed.id);
        const fkGraph = getFKGraphData(ed.id);
        if (!rawSchema || !fkGraph) return;

        // Collect all FK columns up front (single detection pass)
        const fkCols = findFKColumnsInSelect(ed, rawSchema, fkGraph);
        if (fkCols.length === 0) return;

        // Deduplicate by FK column name + table to avoid resolving the same FK twice
        const seen = new Set();
        const uniqueFKCols = [];
        for (const col of fkCols) {
          const key = `${col.fkInfo.fullName}:${col.fkInfo.columnName}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueFKCols.push(col);
          }
        }

        // Resolve bottom-to-top: sort by row desc, then startCol desc
        uniqueFKCols.sort((a, b) => b.row - a.row || b.startCol - a.startCol);

        // Resolve each FK column one at a time, re-detecting after each
        // because positions shift after each resolution
        for (let i = 0; i < uniqueFKCols.length; i++) {
          // After each resolution, re-detect to get updated positions
          if (i > 0) {
            // Re-scan to find remaining FK columns with updated positions
            const updatedCols = findFKColumnsInSelect(ed, rawSchema, fkGraph);
            if (updatedCols.length === 0) break;

            // Find the FK column that matches the one we want to resolve next
            const targetFK = uniqueFKCols[i];
            const targetKey = `${targetFK.fkInfo.fullName}:${targetFK.fkInfo.columnName}`;
            const updated = updatedCols.find(c => {
              const k = `${c.fkInfo.fullName}:${c.fkInfo.columnName}`;
              return k === targetKey;
            });
            if (!updated) continue; // This FK was already resolved or no longer present

            // Use updated position — use columnStartCol to land on the column name
            // (not the qualifier prefix for qualified references like sales_orders.entity_id)
            const cursorCol = updated.columnStartCol != null ? updated.columnStartCol : updated.startCol;
            ed.moveCursorTo(updated.row, cursorCol + 1);
          } else {
            // First iteration: use original position
            const col = uniqueFKCols[i];
            const cursorCol = col.columnStartCol != null ? col.columnStartCol : col.startCol;
            ed.moveCursorTo(col.row, cursorCol + 1);
          }

          const fkInfo = detectFKAtCursor(ed, rawSchema, fkGraph);
          if (fkInfo) {
            applyFKResolution(ed, fkInfo);
          }
        }
      },
    });

    // SELECT * expansion: registered as named command (keyboard shortcut via capture-phase listener above)
    editor.commands.addCommand({
      name: "expandSelectStar",
      bindKey: null, // Key released to capture-phase listener to avoid browser interception of Ctrl+Shift+X
      exec: ed => {
        const rawSchema = getSchemaRawData(ed.id);
        if (rawSchema) {
          expandSelectStar(ed, rawSchema);
        }
      },
    });

    // Listen for programmatic expand requests from the SelectStarHintBanner
    const editorEl = editor.container;
    function handleExpandEvent() {
      editor.commands.exec("expandSelectStar", editor);
    }
    editorEl.addEventListener("jrnybi:expand-select-star", handleExpandEvent);

    // Listen for programmatic FK resolution requests from the FKHintBanner
    function handleResolveFKEvent() {
      editor.commands.exec("resolveAllFKColumns", editor);
    }
    editorEl.addEventListener("jrnybi:resolve-fk-columns", handleResolveFKEvent);

    // Reset Completer in case dot is pressed
    editor.commands.on("afterExec", e => {
      if (e.command.name === "insertstring" && e.args === "." && editor.completer) {
        editor.completer.showPopup(editor);
      }
    });

    QuerySnippet.query().then(snippets => {
      const snippetManager = snippetsModule.snippetManager;
      const m = {
        snippetText: "",
      };
      m.snippets = snippetManager.parseSnippetFile(m.snippetText);

      // Register user-created snippets from the API
      snippets.forEach(snippet => {
        m.snippets.push(snippet.getSnippet());
      });

      // Register built-in SQL pattern snippets and JRNY templates
      SQL_SNIPPETS.concat(JRNY_TEMPLATES).forEach(snip => {
        m.snippets.push({
          name: snip.name,
          content: snip.content,
          tabTrigger: snip.tabTrigger,
        });
      });

      snippetManager.register(m.snippets || [], m.scope);
    });

    editor.focus();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      paste: text => {
        if (editorRef) {
          const { editor } = editorRef;
          editor.session.doc.replace(editor.selection.getRange(), text);
          const range = editor.selection.getRange();
          onChange(editor.session.getValue());
          editor.selection.setRange(range);
        }
      },
      focus: () => {
        if (editorRef) {
          editorRef.editor.focus();
        }
      },
    }),
    [editorRef, onChange]
  );

  return (
    <div className={cx("query-editor-container", className)} {...props} ref={setContainer}>
      <AceEditor
        ref={setEditorRef}
        theme="textmate"
        mode={syntax || "sql"}
        value={currentValue}
        editorProps={editorProps}
        width="100%"
        height="100%"
        setOptions={editorOptions}
        showPrintMargin={false}
        wrapEnabled={false}
        onLoad={initEditor}
        onChange={handleChange}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
});

QueryEditor.propTypes = {
  className: PropTypes.string,
  syntax: PropTypes.string,
  value: PropTypes.string,
  autocompleteEnabled: PropTypes.bool,
  schema: PropTypes.arrayOf(SchemaItemType),
  onChange: PropTypes.func,
  onSelectionChange: PropTypes.func,
  onSelectStarDetected: PropTypes.func,
  onFKDetected: PropTypes.func,
};

QueryEditor.defaultProps = {
  className: null,
  syntax: null,
  value: null,
  autocompleteEnabled: true,
  schema: [],
  onChange: () => {},
  onSelectionChange: () => {},
  onSelectStarDetected: null,
  onFKDetected: null,
};

QueryEditor.Controls = QueryEditorControls;

export default QueryEditor;
export { EXPAND_SHORTCUT_LABEL };
