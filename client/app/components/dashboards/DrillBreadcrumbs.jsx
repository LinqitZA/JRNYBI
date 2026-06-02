// Feature #214 — Drill-down breadcrumb chip bar.
//
// Reads the ?drill=<base64> stack out of the current URL and renders one
// breadcrumb chip per entry plus the current dashboard's title at the end.
// Clicking a chip pops the stack back to that step. The chip bar is hidden
// when the stack is empty so dashboards opened directly look identical to
// before this feature.
//
// Browser back/forward works automatically — clicking a chip calls
// history.push() via location.update(), so the back button pops the same
// stack entry.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import Breadcrumb from "antd/lib/breadcrumb";
import Button from "antd/lib/button";

import location from "@/services/location";
import navigateTo from "@/components/ApplicationArea/navigateTo";
import { popDrillStackUrl, readDrillStack } from "@/services/drillDown";

import "./DrillBreadcrumbs.less";

export default function DrillBreadcrumbs({ currentName }) {
  // Drive a re-render whenever the URL changes (history.push / popstate).
  // location.listen invokes the handler with the freshest location object,
  // so we can recompute the stack from search params on every nav event.
  const [searchString, setSearchString] = useState(() => buildSearchString(location.search));

  useEffect(() => {
    const unlisten = location.listen((loc) => {
      setSearchString(buildSearchString(loc.search));
    });
    return unlisten;
  }, []);

  const stack = useMemo(() => readDrillStack(searchString), [searchString]);

  const goTo = useCallback(
    (idx) => {
      const targetUrl = popDrillStackUrl(stack, idx);
      if (!targetUrl) return;
      // Navigate via the location service so React Router picks it up. The
      // useDashboard effect re-fetches the parent dashboard's data on URL
      // change without a full page reload.
      navigate(targetUrl);
    },
    [stack]
  );

  if (!Array.isArray(stack) || stack.length === 0) {
    return null;
  }

  return (
    <div
      className="dashboard-drill-breadcrumbs m-b-10 p-10 bg-white tiled"
      data-test="DrillBreadcrumbs">
      <Button
        size="small"
        className="drill-back-btn"
        onClick={() => goTo(stack.length - 1)}
        data-test="DrillBackButton">
        <i className="fa fa-arrow-left" aria-hidden="true" /> Back
      </Button>
      <Breadcrumb className="drill-breadcrumb">
        {stack.map((entry, idx) => (
          // eslint-disable-next-line react/no-array-index-key
          <Breadcrumb.Item key={`${idx}-${entry.url}`}>
            <button
              type="button"
              className="drill-breadcrumb-link"
              onClick={() => goTo(idx)}
              data-test={`DrillCrumb-${idx}`}>
              {entry.name}
            </button>
          </Breadcrumb.Item>
        ))}
        <Breadcrumb.Item>
          <span className="drill-breadcrumb-current" data-test="DrillCrumbCurrent">
            {currentName || "Current"}
          </span>
        </Breadcrumb.Item>
      </Breadcrumb>
    </div>
  );
}

DrillBreadcrumbs.propTypes = {
  currentName: PropTypes.string,
};

DrillBreadcrumbs.defaultProps = {
  currentName: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// location.search is the parsed-object form; readDrillStack expects a raw
// search string (because it also handles URLs we build ourselves). Recombine.
function buildSearchString(searchObj) {
  if (!searchObj || typeof searchObj !== "object") return "";
  const parts = [];
  Object.keys(searchObj).forEach((k) => {
    const v = searchObj[k];
    if (v === true) {
      parts.push(encodeURIComponent(k));
    } else if (v != null) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  });
  return parts.length ? `?${parts.join("&")}` : "";
}

function navigate(urlString) {
  // Route through the standard navigateTo helper so the app's React Router
  // picks up the change. navigateTo uses location.update under the hood with
  // path/search/hash split correctly; passing the search as a string (not
  // object) avoids the parameter-merge that location.update applies when
  // search is an object.
  navigateTo(String(urlString));
}
