// Feature #214 — Drill-down with breadcrumb navigation.
//
// Cross-filter (#213) narrows the data on the SAME dashboard. Drill-down
// NAVIGATES to a different dashboard or query, carrying the clicked
// dimension values as parameters and preserving a breadcrumb stack so the
// user can step back through the drill path.
//
// State model
// -----------
// The drill stack lives in the URL as a base64-encoded JSON array:
//
//   ?drill=W3sibmFtZSI6IkV4ZWN1dGl2ZSBPdmVydmlldyIsInVybCI6Ii9kYX...
//
// Each entry is `{ name, url }` where `url` is the FULL relative URL the
// user came from (path + search + hash, minus our own `drill` param). On
// pop, we restore that URL verbatim — that means the parent dashboard's
// dashboard parameters, cross-filters in the URL (if any), and so on, are
// re-applied automatically when the user clicks back.
//
// Living in the URL gives us browser-back/forward for free (history.push
// is what useDashboard / route handlers already do) and lets users share a
// drilled URL without losing context.

import qs from "query-string";
import { isNil } from "lodash";

const DRILL_PARAM = "drill";

// ---------------------------------------------------------------------------
// base64 (URL-safe) <-> JSON for the drill stack
// ---------------------------------------------------------------------------

function encode(stack) {
  if (!Array.isArray(stack) || stack.length === 0) return "";
  try {
    const json = JSON.stringify(stack);
    // window.btoa doesn't handle unicode out of the box; encodeURIComponent
    // round-trips it through %XX escapes which btoa can swallow.
    return btoa(unescape(encodeURIComponent(json)));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("drill stack encode failed:", err);
    return "";
  }
}

function decode(raw) {
  if (!raw) return [];
  try {
    const json = decodeURIComponent(escape(atob(String(raw))));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    // Validate shape — drop entries that don't have both name + url so a
    // hand-crafted ?drill= can't crash the breadcrumb renderer.
    return parsed.filter((entry) => entry && typeof entry === "object" && entry.name && entry.url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("drill stack decode failed; resetting:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Read the current drill stack from a URL search string.
// ---------------------------------------------------------------------------

export function readDrillStack(searchString) {
  if (typeof searchString !== "string") return [];
  const parsed = qs.parse(searchString);
  return decode(parsed[DRILL_PARAM]);
}

// ---------------------------------------------------------------------------
// Strip our own `drill` query param from a URL string so the parent URL
// stored in a stack entry doesn't itself carry a (potentially stale) stack.
// ---------------------------------------------------------------------------

export function stripDrillParam(urlString) {
  if (typeof urlString !== "string" || !urlString) return urlString;
  const [path, search = "", hashSuffix = ""] = splitUrl(urlString);
  const parsed = qs.parse(search);
  if (!(DRILL_PARAM in parsed)) {
    return urlString;
  }
  delete parsed[DRILL_PARAM];
  const newSearch = qs.stringify(parsed);
  return `${path}${newSearch ? `?${newSearch}` : ""}${hashSuffix ? `#${hashSuffix}` : ""}`;
}

function splitUrl(urlString) {
  let rest = urlString;
  let hash = "";
  const hashIdx = rest.indexOf("#");
  if (hashIdx !== -1) {
    hash = rest.slice(hashIdx + 1);
    rest = rest.slice(0, hashIdx);
  }
  let search = "";
  const qIdx = rest.indexOf("?");
  if (qIdx !== -1) {
    search = rest.slice(qIdx + 1);
    rest = rest.slice(0, qIdx);
  }
  return [rest, search, hash];
}

// ---------------------------------------------------------------------------
// Build the next URL when the user drills DOWN from `currentUrl` to
// `targetPath` carrying `targetParams` and a label for the parent step.
// Returns a relative URL string ready for history.push().
// ---------------------------------------------------------------------------

export function buildDrillDownUrl({
  currentUrl,
  currentName,
  targetPath,
  targetParams,
  existingStack,
}) {
  const stack = Array.isArray(existingStack) ? existingStack.slice() : [];

  // Step entry for the page we're LEAVING. Strip our own drill param off the
  // stored URL so popping doesn't double-encode the stack.
  if (currentUrl && currentName) {
    stack.push({
      name: String(currentName),
      url: stripDrillParam(currentUrl),
    });
  }

  // Build the target URL: path + parameter-mapped query string + the new
  // drill stack. The target's own incoming `?drill=` (if any) is ignored —
  // drill-down always starts a fresh forward step here.
  const [targetPathOnly, targetSearch] = splitUrl(String(targetPath || ""));
  const parsedTarget = qs.parse(targetSearch);

  if (targetParams && typeof targetParams === "object") {
    Object.keys(targetParams).forEach((k) => {
      const v = targetParams[k];
      if (!isNil(v)) {
        parsedTarget[k] = String(v);
      }
    });
  }

  const encoded = encode(stack);
  if (encoded) {
    parsedTarget[DRILL_PARAM] = encoded;
  }

  const search = qs.stringify(parsedTarget);
  return `${targetPathOnly}${search ? `?${search}` : ""}`;
}

// ---------------------------------------------------------------------------
// Pop the stack at index `idx` and return the URL to navigate to. If `idx`
// is negative, the parent of the current page is returned (last entry).
// Returns `null` if the stack is empty (no parent to return to).
// ---------------------------------------------------------------------------

export function popDrillStackUrl(stack, idx) {
  if (!Array.isArray(stack) || stack.length === 0) return null;
  let targetIndex = idx;
  if (targetIndex == null || targetIndex < 0) {
    targetIndex = stack.length - 1;
  }
  if (targetIndex >= stack.length) targetIndex = stack.length - 1;

  const entry = stack[targetIndex];
  if (!entry || !entry.url) return null;

  // Re-attach a TRIMMED drill stack to the URL we're returning to. If the
  // user clicked the root crumb, the remaining stack is empty and we strip
  // ?drill=. Otherwise we encode the prefix that led up to that point.
  const remaining = stack.slice(0, targetIndex);
  const [path, search] = splitUrl(entry.url);
  const parsed = qs.parse(search);
  const encoded = encode(remaining);
  if (encoded) {
    parsed[DRILL_PARAM] = encoded;
  } else {
    delete parsed[DRILL_PARAM];
  }
  const newSearch = qs.stringify(parsed);
  return `${path}${newSearch ? `?${newSearch}` : ""}`;
}

// ---------------------------------------------------------------------------
// Translate a chart's `drillDown` viz option + the clicked source row into
// the parameter map that goes onto the target URL.
//
//   drillDown.parameterMapping = { p_customer_id: "customer_id" }
//
// `sourceRow` is the raw query result row that produced the clicked
// element. For each (paramName -> columnName) entry, we pull the value off
// the row. Entries pointing at a column the row doesn't have are skipped
// rather than serialised as "undefined".
// ---------------------------------------------------------------------------

export function resolveDrillParameters(parameterMapping, sourceRow, fallback = {}) {
  const out = {};
  if (!parameterMapping || typeof parameterMapping !== "object") return out;
  Object.keys(parameterMapping).forEach((paramName) => {
    const sourceCol = parameterMapping[paramName];
    let value;
    if (sourceRow && Object.prototype.hasOwnProperty.call(sourceRow, sourceCol)) {
      value = sourceRow[sourceCol];
    } else if (fallback && Object.prototype.hasOwnProperty.call(fallback, sourceCol)) {
      value = fallback[sourceCol];
    }
    if (!isNil(value)) {
      out[paramName] = value;
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Translate a drillDown.target spec into a navigable URL path.
//
// Accepted target shapes:
//   "/dashboards/customer-detail"  — explicit path; used as-is
//   "dashboard/customer-detail"    — short form; expanded to /dashboards/...
//   "query/42"                     — short form; expanded to /queries/42
//   { kind: "dashboard", id: "customer-detail" }
//   { kind: "query", id: 42 }
// ---------------------------------------------------------------------------

export function resolveDrillTargetPath(target) {
  if (!target) return null;
  if (typeof target === "string") {
    const trimmed = target.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/")) return trimmed;
    const m = trimmed.match(/^(dashboard|query)\/(.+)$/);
    if (m) {
      const kind = m[1];
      const id = m[2];
      return kind === "dashboard" ? `/dashboards/${id}` : `/queries/${id}`;
    }
    return `/${trimmed}`;
  }
  if (typeof target === "object") {
    if (target.kind === "dashboard" && target.id != null) {
      return `/dashboards/${target.id}`;
    }
    if (target.kind === "query" && target.id != null) {
      return `/queries/${target.id}`;
    }
    if (target.path) {
      return String(target.path);
    }
  }
  return null;
}

export default {
  readDrillStack,
  stripDrillParam,
  buildDrillDownUrl,
  popDrillStackUrl,
  resolveDrillParameters,
  resolveDrillTargetPath,
};
