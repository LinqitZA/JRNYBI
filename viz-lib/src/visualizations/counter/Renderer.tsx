/**
 * Backwards-compatibility shim for the Counter Renderer.
 *
 * The implementation lives in `./Renderer/index.tsx` (feature #192 KPI Card
 * v2). This file is kept as a re-export so older imports that point at
 * `./Renderer.tsx` continue to work. Webpack / Babel resolve the .tsx file
 * before the directory, so this file is the canonical entrypoint and the
 * directory is the implementation.
 */
export { default } from "./Renderer/index";
