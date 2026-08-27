// Shared chrome between the real composer (SearchComposer) and the read-only
// preview surface (ComposerWithPreview). Both must render pixel-identical —
// the preview overlays the editor in the same grid cell — so the box and the
// text metrics live here instead of being duplicated and drifting apart.

/** The bar's box: border, background, radius, padding, min height. */
export const COMPOSER_SURFACE_CLASSES =
  "border-input bg-background relative min-h-9 rounded-md border px-2 py-1.5";

/** The query text metrics: mono font, pill-matched line height, wrapping. */
export const COMPOSER_TEXT_CLASSES =
  "min-h-6 font-mono text-xs leading-6 break-words whitespace-pre-wrap";
