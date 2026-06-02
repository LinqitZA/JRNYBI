/**
 * JRNYBI Theme Service
 *
 * Manages the light / dark / system theme preference for the current user.
 * Preference is persisted to localStorage (per browser-per-user, since the
 * user authenticates before this code runs). The active theme is applied as
 * a CSS class on <html>:
 *   - .jrny-theme-light  (default)
 *   - .jrny-theme-dark
 *
 * Components that need to react to a theme change can:
 *   import theme from "@/services/theme";
 *   theme.subscribe((active) => { ... });
 *
 * `active` is "light" or "dark" — the resolved value, never "system".
 */

const STORAGE_KEY = "jrnybi:theme";
const VALID_MODES = ["light", "dark", "system"];

const subscribers = new Set();

function readStoredMode() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.includes(value)) return value;
  } catch (e) {
    // localStorage can be blocked by privacy mode / sandboxed iframes.
  }
  return "system";
}

function getSystemTheme() {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  } catch (e) {
    // matchMedia missing — fall back to light.
  }
  return "light";
}

function resolve(mode) {
  return mode === "system" ? getSystemTheme() : mode;
}

let currentMode = readStoredMode();

function applyToDocument(active) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("jrny-theme-dark", active === "dark");
  root.classList.toggle("jrny-theme-light", active !== "dark");
  // expose as a data attribute too so non-CSS consumers can read it
  root.setAttribute("data-jrny-theme", active);
}

function notify(active) {
  applyToDocument(active);
  subscribers.forEach(fn => {
    try {
      fn(active);
    } catch (e) {
      // Subscriber errors must not break others.
    }
  });
}

const theme = {
  get mode() {
    return currentMode;
  },
  get active() {
    return resolve(currentMode);
  },
  isDark() {
    return resolve(currentMode) === "dark";
  },
  setMode(mode) {
    if (!VALID_MODES.includes(mode)) return;
    currentMode = mode;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (e) {
      // ignore storage failure; in-memory state still updates
    }
    notify(resolve(mode));
  },
  subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};

// Apply on first import so the page is correctly themed before React mounts.
if (typeof window !== "undefined") {
  applyToDocument(resolve(currentMode));

  // React to OS-level theme changes when the user picked "system".
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (currentMode === "system") notify(resolve("system"));
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler); // Safari legacy
  } catch (e) {
    // matchMedia not supported — skip.
  }
}

export default theme;
