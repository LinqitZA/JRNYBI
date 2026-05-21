import React, { useEffect, useMemo, useState, useCallback, useImperativeHandle } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import ace from "ace-builds";
import { AceEditor, snippetsModule, updateSchemaCompleter, getSchemaRawData, getFKGraphData } from "./ace";
import { detectFKAtCursor, applyFKResolution, findFKColumnsInSelect } from "./fkResolution";
import { SQL_SNIPPETS, JRNY_TEMPLATES, expandSelectStar, findSelectStarPositions } from "./querySnippets";
import { srNotify } from "@/lib/accessibility";
import { SchemaItemType } from "@/components/queries/SchemaBrowser";
import KeyboardShortcuts from "@/services/KeyboardShortcuts";
import resizeObserver from "@/services/resizeObserver";
import QuerySnippet from "@/services/query-snippet";

import QueryEditorControls from "./QueryEditorControls";
import "./index.less";

const editorProps = { $blockScrolling: Infinity };

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const EXPAND_SHORTCUT_LABEL = isMac ? "⌘⇧E" : "Ctrl+Shift+E";

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

  // Bind Ctrl+Shift+E via Mousetrap (browser intercepts before Ace sees it)
  useEffect(() => {
    if (editorRef) {
      const editor = editorRef.editor;
      const expandHandler = () => {
        editor.commands.exec("expandSelectStar", editor);
      };
      const shortcuts = { "mod+shift+e": expandHandler };
      KeyboardShortcuts.bind(shortcuts);
      return () => {
        KeyboardShortcuts.unbind(shortcuts);
      };
    }
  }, [editorRef]);

  // Bind Ctrl+. via Mousetrap (browser emoji picker intercepts before Ace sees it)
  useEffect(() => {
    if (editorRef) {
      const editor = editorRef.editor;
      const fkResolveHandler = () => {
        editor.commands.exec("resolveFKColumn", editor);
      };
      const shortcuts = { "mod+.": fkResolveHandler };
      KeyboardShortcuts.bind(shortcuts);
      return () => {
        KeyboardShortcuts.unbind(shortcuts);
      };
    }
  }, [editorRef]);

  const initEditor = useCallback(editor => {
    // Release Cmd/Ctrl+L to the browser
    editor.commands.bindKey({ win: "Ctrl+L", mac: "Cmd+L" }, null);

    // Release Cmd/Ctrl+Shift+F for format query action
    editor.commands.bindKey({ win: "Ctrl+Shift+F", mac: "Cmd+Shift+F" }, null);

    // Release Cmd/Ctrl+Shift+E so Mousetrap can handle it (browser intercepts before Ace sees it)
    editor.commands.bindKey({ win: "Ctrl+Shift+E", mac: "Cmd+Shift+E" }, null);

    // Release Ctrl+. / Cmd+. so Mousetrap can handle it (browser emoji picker intercepts before Ace sees it)
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

    // FK resolution: registered as named command (keyboard shortcut via Mousetrap below)
    editor.commands.addCommand({
      name: "resolveFKColumn",
      bindKey: null, // Key released to Mousetrap to avoid browser interception of Ctrl+.
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

    // SELECT * expansion: registered as named command (keyboard shortcut via Mousetrap below)
    editor.commands.addCommand({
      name: "expandSelectStar",
      bindKey: null, // Key released to Mousetrap to avoid browser interception of Ctrl+Shift+E
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
