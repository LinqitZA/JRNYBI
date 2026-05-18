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
 * TODO: Implement component (this is a placeholder for project structure)
 */

import React from "react";

export default function DataDictionary() {
  // TODO: Implement Data Dictionary page
  return (
    <div className="jrny-data-dictionary">
      <h2>Data Dictionary</h2>
      <p>Coming soon - schema browser for JRNY ERP data.</p>
    </div>
  );
}
