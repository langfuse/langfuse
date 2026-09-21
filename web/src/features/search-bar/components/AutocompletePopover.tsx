// Positions the presentational AutocompleteListbox under the composer. The
// listbox itself is pure and lives in AutocompleteListbox.tsx (and has the
// Storybook story).

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
import {
  AutocompleteListbox,
  type AutocompleteListboxProps,
} from "@/src/features/search-bar/components/AutocompleteListbox";

export type AutocompletePopoverProps = AutocompleteListboxProps & {
  /** Anchor x in px, relative to the positioned composer container. */
  anchorLeft: number;
};

/**
 * Positions the listbox under the composer at `anchorLeft`. The shared Popover
 * primitive owns viewport collision and scroll positioning.
 *
 * Its content is portaled to the app's popover layer, so it escapes scroll
 * containers and overflow-clipped panels (such as evaluator and rule setup).
 */
export function AutocompletePopover({
  anchorLeft,
  ...listbox
}: AutocompletePopoverProps) {
  return (
    <Popover open>
      <PopoverAnchor
        className="pointer-events-none absolute inset-y-0 w-px"
        style={{ left: anchorLeft }}
      />
      {/* Suppress focus moves across the WHOLE popover surface, not just the
          option rows: a mousedown on a section title / divider / padding would
          otherwise blur the composer and fire its onBlur commit, flashing the
          red invalid state on a mid-completion draft (`level:`, `tags:(`, …).
          The per-option guard in AutocompleteListbox stays (preventDefault is
          idempotent). */}
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        className="w-max max-w-[calc(100vw-16px)] min-w-[min(420px,calc(100vw-16px))] overflow-visible p-0"
      >
        <AutocompleteListbox {...listbox} />
      </PopoverContent>
    </Popover>
  );
}
