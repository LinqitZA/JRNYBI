import { useEffect, useState } from "react";

/**
 * usePrintMode — returns true while the page is in print preview / printing.
 *
 * Used by lazy-loaded widgets to force-render themselves so a print or
 * "Save as PDF" never captures empty skeleton placeholders.
 *
 * Detection combines two signals:
 *   1. The `beforeprint` / `afterprint` window events — fire in evergreen
 *      browsers when the print dialog opens/closes.
 *   2. matchMedia("print") — covers Chromium's headless export path which
 *      flips the media query without dispatching `beforeprint`.
 *
 * Either signal flipping on sets the state to true; both must clear it.
 */
export default function usePrintMode() {
  const [isPrinting, setIsPrinting] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    try {
      return window.matchMedia("print").matches;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleBefore = () => setIsPrinting(true);
    const handleAfter = () => setIsPrinting(false);

    window.addEventListener("beforeprint", handleBefore);
    window.addEventListener("afterprint", handleAfter);

    let mql = null;
    let mqlListener = null;
    if (typeof window.matchMedia === "function") {
      try {
        mql = window.matchMedia("print");
        mqlListener = (e) => setIsPrinting(e.matches);
        // Older Safari uses addListener/removeListener; everywhere else uses addEventListener.
        if (typeof mql.addEventListener === "function") {
          mql.addEventListener("change", mqlListener);
        } else if (typeof mql.addListener === "function") {
          mql.addListener(mqlListener);
        }
      } catch (e) {
        mql = null;
      }
    }

    return () => {
      window.removeEventListener("beforeprint", handleBefore);
      window.removeEventListener("afterprint", handleAfter);
      if (mql && mqlListener) {
        if (typeof mql.removeEventListener === "function") {
          mql.removeEventListener("change", mqlListener);
        } else if (typeof mql.removeListener === "function") {
          mql.removeListener(mqlListener);
        }
      }
    };
  }, []);

  return isPrinting;
}
