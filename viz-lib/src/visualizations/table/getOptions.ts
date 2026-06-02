import _ from "lodash";
import {
  getDefaultColumnsOptions,
  getDefaultFormatOptions,
  getColumnsOptions,
} from "@/visualizations/shared/columnUtils";

const DEFAULT_OPTIONS = {
  itemsPerPage: 25,
  paginationSize: "default", // not editable through Editor

  // ---------------------------------------------------------------------
  // Feature #211 — Server-side virtualised scrolling for large tables.
  // ---------------------------------------------------------------------
  // When enabled and a queryResultId is available, the renderer switches
  // AG Grid into the `infinite` row model and fetches rows page-by-page
  // from POST /api/query_results/<id>/page. This avoids loading 100k+ rows
  // into the browser at once.
  //
  // Recommended threshold: turn this on for queries that routinely return
  // 100,000 rows or more. Below that, the default client-side pagination
  // is faster (no per-page network round-trip) and offers true global
  // sort/filter without server cooperation.
  enableServerSideVirtualization: false,
  // AG Grid's `cacheBlockSize`. 200 is a good balance: large enough that
  // smooth scrolling rarely triggers a fetch, small enough that the JSON
  // payload stays under ~1MB even with wide rows.
  serverSidePageSize: 200,
};


export default function getOptions(options: any, { columns }: any) {
  options = { ...DEFAULT_OPTIONS, ...options };
  options.columns = _.map(getColumnsOptions(columns, options.columns, { allowSearch: false }), col => ({
    ...getDefaultFormatOptions(col),
    ...col,
  }));
  return options;
}
