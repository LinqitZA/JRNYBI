import { useEffect, useRef, useState } from "react";

/**
 * useLazyMount — defer rendering until an element scrolls into view.
 *
 * Returns `[ref, isVisible]`. Attach `ref` to a placeholder DOM node; once
 * any part of it enters the viewport (extended by `rootMargin`), `isVisible`
 * flips to true and stays true (we unobserve, so this is one-way).
 *
 * Options:
 *   - rootMargin: CSS margin around the viewport for the observer.
 *       Defaults to "200px" so widgets hydrate before the user scrolls them
 *       into view, hiding the placeholder swap.
 *   - forceVisible: bypass the observer and report visible immediately.
 *       Used by print/export paths so every widget is mounted regardless
 *       of scroll position.
 *
 * Falls back to immediate visibility when IntersectionObserver isn't
 * supported (very old browsers, JSDOM in tests) so nothing breaks.
 */
export default function useLazyMount({ rootMargin = "200px", forceVisible = false } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => {
    if (forceVisible) return true;
    if (typeof window === "undefined") return true;
    if (typeof window.IntersectionObserver !== "function") return true;
    return false;
  });

  useEffect(() => {
    if (visible) return undefined;
    if (forceVisible) {
      setVisible(true);
      return undefined;
    }
    const node = ref.current;
    if (!node) return undefined;
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") {
      setVisible(true);
      return undefined;
    }

    const observer = new window.IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin, threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, forceVisible, visible]);

  // If the caller flips forceVisible to true after the initial mount (e.g.
  // beforeprint fires), make sure we surface the change immediately.
  useEffect(() => {
    if (forceVisible && !visible) {
      setVisible(true);
    }
  }, [forceVisible, visible]);

  return [ref, visible];
}
