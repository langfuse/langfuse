# Theme Lab (dev-only)

In-app panel for live-tuning the surface ladder, typography, and text-color tokens; survives reloads/navigations. Enable via `themeLab.enable()` in the browser console (or `localStorage.themeLab = "1"` + reload); disable with `themeLab.disable()` or the panel's Reset/close.
Dev-only: mounted behind a static `process.env.NODE_ENV === "development"` check in `ThemeLabMount.tsx`, so the panel code is dead-code-eliminated (tree-shaken) from production bundles.
Overrides live inline on `<html>` plus a managed style tag, persisted in `localStorage.themeLabOverrides`; "Copy CSS" emits ready-to-paste `globals.css` lines.
`theme-lab-script.ts` is a port of the standalone `.screenshots-review/_tools/theme-lab.js` (console/bookmarklet fallback for non-dev contexts) — keep the two in sync.
