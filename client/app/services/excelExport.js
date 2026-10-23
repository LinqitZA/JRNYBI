// "Download as Excel (as shown)": POST the ExportGrid the visualization gives and save the .xlsx.
// Contract: docs/superpowers/specs/2026-10-21-jrnybi-excel-as-shown-design.md in the JRNY repo.
import { get, isString } from "lodash";
import { axios } from "@/services/axios";
import notification from "@/services/notification";
import { buildExportSubtitle, sanitizeExcelFileName } from "@/lib/excelAsShown";

export const EXCEL_EXPORT_URL = "api/jrny/excel-export";
export const NOT_EXPORTABLE_MESSAGE = "This visualization can't be exported as shown";
const ERROR_TITLE = "Couldn't download the Excel file";

function readBlobText(blob) {
  if (typeof blob.text === "function") {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// With responseType "blob" an error body arrives as a Blob too; dig the server's message out of it.
async function errorMessage(error) {
  const data = get(error, "response.data");
  try {
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      const text = await readBlobText(data);
      try {
        const message = get(JSON.parse(text), "message");
        if (isString(message) && message) {
          return message;
        }
      } catch (e) {
        // not JSON; fall through
      }
    } else if (isString(get(data, "message")) && data.message) {
      return data.message;
    }
  } catch (e) {
    // unreadable body; fall through
  }
  return get(error, "message") || "Something went wrong. Please try again.";
}

function saveBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  // the router ignores anchors with a `download` attribute (handleNavigationIntent)
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // revoke later: some browsers start the download asynchronously
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }
}

// Resolves true when the file was saved, false otherwise (the user has been notified). Never rejects.
export async function downloadExcelAsShown(grid, { title, subtitle } = {}) {
  try {
    const body = {
      ...grid,
      title: grid.title || title || undefined,
      subtitle: grid.subtitle || subtitle || undefined,
    };
    // the axios service's response interceptor unwraps response.data, i.e. the Blob itself
    const blob = await axios.post(EXCEL_EXPORT_URL, body, { responseType: "blob" });
    if (typeof Blob === "undefined" || !(blob instanceof Blob)) {
      throw new Error("The server did not return a file.");
    }
    saveBlob(blob, sanitizeExcelFileName(body.title));
    return true;
  } catch (error) {
    notification.error(ERROR_TITLE, await errorMessage(error));
    return false;
  }
}

// exportRef: the ref passed to VisualizationRenderer; viz-lib sets `current = { getGrid }` for
// visualizations that can be exported as shown. parameters: the Parameter objects the result was run with.
export async function exportVisualizationAsShown(exportRef, { title, parameters } = {}) {
  let grid;
  try {
    const exporter = exportRef && exportRef.current;
    grid = exporter && typeof exporter.getGrid === "function" ? exporter.getGrid() : null;
  } catch (error) {
    notification.error(ERROR_TITLE, get(error, "message") || NOT_EXPORTABLE_MESSAGE);
    return false;
  }
  if (!grid) {
    notification.warning(NOT_EXPORTABLE_MESSAGE);
    return false;
  }
  return downloadExcelAsShown(grid, { title, subtitle: buildExportSubtitle(parameters) });
}
