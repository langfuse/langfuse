// Composition wrapper: the real SearchComposer plus a read-only preview
// surface, stacked in the same grid cell. While `previewText` (store) is
// active — a category-preset row being hovered/focused — the preview fades in
// ON TOP and the editor is hidden underneath.
//
// Why composition instead of teaching SearchComposer about previews: the
// composer is the most invariant-dense component in the feature (contenteditable
// projection, undo history, selection mirroring), and a preview never needs any
// of that. Stacking keeps the editor MOUNTED — unmounting would wipe its
// undo/selection/autocomplete refs — and never reprojects its DOM, so a preview
// cannot interact with editing state by construction. The grid cell sizes to
// max(editor, preview), so a wrapping preview grows the band instead of
// clipping. Both surfaces share their chrome via composer-chrome.ts so the
// overlay renders pixel-identical.

import * as React from "react";

import { cn } from "@/src/utils/tailwind";

import { scoreTypeContextFromObserved } from "@/src/features/search-bar/lib/observed-options";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
import { ComposerTokens } from "@/src/features/search-bar/components/ComposerTokens";
import { useSearchBarStore } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import {
  COMPOSER_SURFACE_CLASSES,
  COMPOSER_TEXT_CLASSES,
} from "@/src/features/search-bar/components/composer-chrome";

export function ComposerWithPreview(
  props: React.ComponentProps<typeof SearchComposer>,
) {
  const previewText = useSearchBarStore((s) => s.previewText);
  const previewActive = previewText !== null;

  // Same score-type routing the composer uses, so preview pills type-classify
  // (numeric vs categorical scores) identically to the real query.
  const scoreTypes = React.useMemo(
    () => scoreTypeContextFromObserved(props.observed),
    [props.observed],
  );

  return (
    <div className="grid">
      <div
        className={cn(
          "col-start-1 row-start-1 min-w-0",
          // visibility (not display) keeps the editor's height contributing
          // to the cell, so the band never collapses under a shorter preview.
          previewActive && "invisible",
        )}
      >
        <SearchComposer {...props} />
      </div>
      {previewActive && (
        <div
          data-testid="search-bar-preview"
          data-composer-preview-text={previewText}
          className={cn(
            "col-start-1 row-start-1 min-w-0",
            "animate-in fade-in-0 duration-150",
          )}
        >
          <div className={COMPOSER_SURFACE_CLASSES}>
            <div className={COMPOSER_TEXT_CLASSES}>
              <ComposerTokens
                draft={previewText}
                showDiagnostics={false}
                scoreTypes={scoreTypes}
                fieldReason={props.fieldReason}
                freeTextReason={props.freeTextReason}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
