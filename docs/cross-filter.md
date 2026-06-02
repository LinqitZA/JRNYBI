# Cross-filter on click (Feature #213)

When a user clicks a bar, slice, or row in one widget on a JRNYBI dashboard,
that selection becomes a *cross-filter* that narrows every other widget on
the same dashboard whose data shares the same dimension.

This is the defining interaction of a modern BI dashboard (Power BI,
Tableau, Superset all behave this way) and is delivered through a
dashboard-scoped filter bus.

## Architecture

```
DashboardPage
└── CrossFilterProvider                      (client/app/services/crossFilterBus.js)
    ├── CrossFilterChips                     (chip bar at top of dashboard)
    └── DashboardGrid → … → VisualizationRenderer
                              ├── options.onCrossFilter   ⇐ click handlers in
                              │     Plotly / ECharts / AG-Grid table call this
                              └── options.activeCrossFilters
                                    ⇐ rows are filtered client-side before
                                       being handed to the chart renderer
```

* **`crossFilterBus.js`** – React context exposing `activeFilters`,
  `dispatchFilter`, `clearFilter`, `clearAllFilters`. Falls back to a
  no-op bus when used outside a dashboard so the Query page is unaffected.
* **`CrossFilterChips.jsx`** – Renders one closable Ant Design tag per
  active cross-filter plus a "Clear all" button. Hidden when nothing is
  active so the existing dashboard layout doesn't shift.
* **`VisualizationRenderer.jsx`** – On dashboards, injects
  `options.onCrossFilter`, `options.activeCrossFilters` and
  `options.crossFilterSource` into the options object handed to each
  visualization. Active filters are applied as row predicates after the
  user's local Filters so cross-filtering composes with explicit filters.
* **Chart renderers** – Each library wires its own click event:
  * Plotly: `container.on('plotly_click', …)` in
    `viz-lib/src/visualizations/chart/Renderer/initChart.ts`
  * ECharts: `instance.on('click', …)` in
    `viz-lib/src/visualizations/echarts/Renderer.tsx`
  * AG-Grid (Table viz): `onCellClicked` in
    `viz-lib/src/visualizations/table/Renderer.tsx`

## Column-mapping convention

A cross-filter is `(dimension, value)`. The **dimension is a column name**
shared across the data of every widget that should react to the filter.

### Chart visualizations (Plotly + ECharts)

* By default the dimension is the chart's `x` column (the same column the
  editor's *X Column* selector points to). Click a bar → dispatch the
  bar's category value as a filter on that column name.
* Override with `options.crossFilter = { enabled: true, dimension: "<colName>" }`
  to pin a chart to a specific dimension. Useful for stacked-bar charts
  whose categorical dimension isn't on the x-axis.
* Disable entirely with `options.crossFilter = { enabled: false }` or
  `options.crossFilter = false`.

### Table visualization (AG-Grid)

* Mark a column with `crossFilter: true` in its column config. Clicking
  any cell in that column dispatches the cell's value as a filter on the
  column's name.
* If exactly one column on the table is marked, clicking *anywhere* on
  the row dispatches that column's value (lets you mark a single "key"
  column and drive filters from any cell click).
* Or set `options.crossFilter.dimension = "<colName>"` to make the entire
  table dispatch a single dimension regardless of clicks.

### Receiving widget convention

A widget receives a cross-filter when:

1. The widget's data has a **column with a matching name** (case-insensitive)
   to the active filter's dimension. Widgets with no matching column are
   simply unaffected.
2. The widget is **not the originator** of that filter. A chart never
   filters itself on its own click — the user can still see the full
   distribution with the chip bar showing the selection.

The match is column-name-based intentionally — it requires no per-widget
configuration and works automatically for the typical case where the same
business dimension (`branch`, `customer`, `product`, `month`) appears in
multiple queries on a dashboard.

## Filter application

Cross-filters are applied **client-side** as row predicates inside
`VisualizationRenderer`, after the existing local `Filters` are applied
and before the rows reach the underlying chart library. This means:

* No backend changes are required for the basic case.
* Cross-filters compose with parameter-driven filtering — the SQL still
  runs once with the dashboard's parameter values, and the cross-filter
  is layered on top.
* For very large result sets, prefer a parameter-driven pattern: have the
  query expose `{{ xf_<dimension> }}` parameters and wire them at the
  dashboard parameter level, so the database does the filtering. The
  client-side row predicate then becomes a no-op (the rows are already
  filtered).

## Toggle behavior

Clicking a chart element with the *same* dimension+value as the active
cross-filter **clears** that filter. This matches the standard BI
expectation that the same gesture both sets and unsets a selection.

## Disabling

Set `options.crossFilter = false` (or `{ enabled: false }`) on a
visualization's options to opt out — the click handler will skip
dispatching and the widget will still receive cross-filters from other
widgets. To opt a widget out of *receiving* filters as well, omit the
matching column from the query.
