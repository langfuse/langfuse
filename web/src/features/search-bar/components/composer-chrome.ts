// Shared chrome between the real composer (SearchComposer) and the read-only
// preview surface (ComposerWithPreview). Both must render pixel-identical —
// the preview overlays the editor in the same grid cell — so the box and the
// text metrics live here instead of being duplicated and drifting apart.

/** Bar heights mirror the design-system SearchInput: default h-8, large h-9. */
export type ComposerSize = "default" | "large";

/** The bar's box: border, background, radius, padding, min height. */
export function composerSurfaceClasses(size: ComposerSize = "default") {
  return size === "large"
    ? "border-input bg-background relative min-h-9 rounded-md border px-2 py-1.25"
    : "border-input bg-background relative min-h-8 rounded-md border px-2 py-0.75";
}

/** The query text metrics: mono font, pill-matched line height, wrapping. */
export const COMPOSER_TEXT_CLASSES =
  "min-h-6 font-mono text-xs leading-6 break-words whitespace-pre-wrap";
