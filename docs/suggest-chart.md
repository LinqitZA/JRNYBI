# Auto chart-type suggestion (Feature #215)

When a user opens the visualization editor on a query, JRNYBI inspects the
result's columns and a sample of rows and suggests the best chart type:

* `datetime + numeric` → **Line**
* `datetime + numeric + categorical (2..12 cardinality)` → **Line** with
  the categorical as the `series` grouping
* `categorical (low cardinality) + numeric` → **Bar (column)**
* `categorical (>12 cardinality) + numeric` → **Bar (column)** with
  horizontal axes
* `categorical (<=8 cardinality) + numeric` → **Pie**
* `two numerics, no temporal` → **Scatter**
* `three+ numerics, no temporal` → **Bubble** (third numeric → size)

Multiple rules can match — the editor surfaces the **highest-scoring**
match in the picker UI.

## Where it lives

* **Heuristic** — `viz-lib/src/lib/suggest-chart.ts`. Pure function. No
  React, no host coupling. Easy to unit-test.
* **Surfaced in** — `viz-lib/src/visualizations/chart/Editor/GeneralSettings.tsx`
  passes the suggestion's type to `ChartTypeSelect` (renders a
  "Recommended" tag next to it in the dropdown) and shows an inline
  recommendation banner with an **Apply suggestion** button.
* **Telemetry hook** — `recordSuggestionDecision({...})` is fired on
  `offered`, `accepted`, and `rejected`. The default sink is
  `console.debug` so the events show up in DevTools. Hosts wanting to ship
  this to a telemetry endpoint call `setSuggestionRecorder(fn)` once at
  app boot to override the sink — no per-call wiring needed.

## Behavior

* The suggestion **never auto-applies**. The user has to click "Apply
  suggestion" — existing visualizations open with the editor showing
  whatever globalSeriesType is already saved.
* Apply patches `globalSeriesType`, the `seriesOptions[*].type`, the
  `columnMapping`, and any per-suggestion overrides (e.g. `swappedAxes:
  true` for horizontal-bar). All in one `onOptionsChange` so the editor
  re-renders cleanly.
* If the user manually picks a chart type **different** from the
  suggestion after seeing it, that registers as a `rejected` decision.
  Picking the same type registers as `accepted`. This is how we build
  the dataset for a future ML-based improvement without invading the
  rule layer.

## Adding a rule

`RULES` in `suggest-chart.ts` is a list of `(Categorised) → ChartSuggestion | null`
functions. Each rule:

1. Pattern-matches against the categorised column counts + cardinalities.
2. Picks the columns it wants for the mapping.
3. Returns a suggestion with a score (0..100; higher wins) and a
   human-readable `reason` that the editor displays verbatim.

Higher-quality signals (e.g. multi-series time series) score in the 90s;
weak fall-back signals (two numerics → scatter) score in the 60s. The
runner sorts by score, stable across authoring order so ties stay
deterministic.

## Why rules, not ML

* Determinism — fixture queries produce the same recommendation every CI run.
* Self-explainability — every suggestion ships with a `reason` string we
  can show the user. ("Time series detected: order_date + total_revenue.")
* Cost — runs synchronously in <1ms even on a 100k-row query; no model
  artifact to ship in the bundle.
* The `recordSuggestionDecision` hook gathers the dataset we need to
  validate any future model BEFORE replacing the heuristic.
