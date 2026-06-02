# Drill-down with breadcrumb navigation (Feature #214)

Cross-filter (#213) narrows the data on the *same* dashboard. Drill-down
**navigates between dashboards / queries**, carrying the clicked dimension
value as a parameter and preserving a breadcrumb stack so the user can step
back through the drill path.

## Configuring drill-down on a visualization

Set `options.drillDown` on the visualization:

```json
{
  "drillDown": {
    "enabled": true,
    "target": "dashboard/customer-detail",
    "parameterMapping": {
      "p_customer_id": "customer_id",
      "p_branch_id":   "branch_id"
    }
  }
}
```

* **`target`** — where to navigate. Accepted shapes:
  * `"dashboard/<slug-or-id>"` — short form for `/dashboards/<id>`
  * `"query/<id>"` — short form for `/queries/<id>`
  * Any explicit path starting with `/` is used as-is
  * `{ kind: "dashboard", id: "customer-detail" }` — object form
* **`parameterMapping`** — `{ urlParam → rowColumn }`. Each entry pulls a
  value off the clicked row and writes it onto the target's query string as
  `?p_xxx=…`. Mappings that point at a column the row doesn't have are
  silently skipped (no `undefined` ends up in the URL).
* **`enabled`** — set to `false` to disable without removing the config.
* **`parentName`** *(optional)* — overrides the label that appears for this
  dashboard in the breadcrumb stack. Defaults to the document title.

## Breadcrumb stack in the URL

The stack lives in the URL as `?drill=<base64-json>`:

```
/dashboards/customer-detail?p_customer_id=42&drill=W3sibmFtZSI6...
```

The encoded array entries are `{ name, url }` — `url` is the full relative
URL the user came from, minus its own `drill` param. Living in the URL
means:

* **Browser back/forward** work automatically — they walk the `history`
  stack that drill-down navigation pushed.
* **Drilled URLs are shareable** — the recipient lands on the drilled page
  with the same breadcrumb chain.
* **Refresh is safe** — reload re-renders the breadcrumbs from the URL.

`DrillBreadcrumbs.jsx` reads the stack and renders one chip per parent step
plus the current dashboard at the tail. Clicking a chip pops the stack back
to that step (the remaining prefix is re-encoded onto that step's URL so
the user can keep walking the chain). A *Back* button next to the
breadcrumb pops one step.

## Click-handler contract

The chart renderers (Plotly / ECharts / AG-Grid) check
`options.onDrillDown` on click. The host (`VisualizationRenderer`) supplies
that callback only when the visualization has `options.drillDown.target`
configured.

```ts
options.onDrillDown(sourceRow, meta);
//   sourceRow: the raw query row that produced the clicked element
//   meta:      library-specific extras (echartsParams / plotlyPoint / clickedColumn)
```

`VisualizationRenderer.handleDrillDown` then:

1. Resolves `target` → `/dashboards/<id>` (or whatever path).
2. Maps `parameterMapping` against the source row → `{ p_… : value }`.
3. Reads the current `?drill=` stack and pushes the current page.
4. Calls `navigateTo(builtUrl)`.

The chart never builds the URL itself — that responsibility lives in the
single `drillDown` service so all viz types behave consistently.

## Drill-down vs cross-filter precedence

When a viz has **both** cross-filter and drill-down wired, drill-down
**wins** — the click navigates away rather than fire-and-stay. Running the
cross-filter dispatch as well would pollute the parent dashboard's bus
with a filter the user can't see (because they've left the dashboard).

## Disabling

`options.drillDown.enabled = false` disables drill-down for a viz without
removing the config. Omitting `target` entirely also disables it.
