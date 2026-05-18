/**
 * JRNYBI Data Dictionary Page
 *
 * Displays an interactive schema browser for the JRNY ERP read-replica database.
 * Features:
 * - Collapsible tree view: Schema -> Table/View -> Columns
 * - Search/filter across all levels
 * - Column details: type, nullable, default, comment
 * - "Copy query" button: copies SELECT * FROM schema.table LIMIT 100
 * - "New Query" link: opens query editor with table pre-filled
 *
 * API: GET /api/jrny/data-dictionary
 *
 * TODO: Implement full component (this is a minimal placeholder for route registration)
 */

import React from "react";
import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import routes from "@/services/routes";

import "./DataDictionary.less";

function DataDictionary() {
  return (
    <div className="jrny-data-dictionary container p-t-15">
      <h2>Data Dictionary</h2>
      <p>Schema browser for JRNY ERP data. Coming soon.</p>
    </div>
  );
}

routes.register(
  "JRNY.DataDictionary",
  routeWithUserSession({
    path: "/jrny/data-dictionary",
    title: "Data Dictionary",
    render: (pageProps) => <DataDictionary {...pageProps} />,
  })
);

export default DataDictionary;
