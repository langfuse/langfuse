// Positions the presentational AutocompleteListbox under the composer and
// clamps it to the viewport. The listbox itself is pure and lives in
// AutocompleteListbox.tsx (and has the Storybook story).

import * as React from "react";

import {
  AutocompleteListbox,
  type AutocompleteListboxProps,
} from "@/src/features/search-bar/components/AutocompleteListbox";

export type AutocompletePopoverProps = AutocompleteListboxProps & {
  /** Anchor x in px, relative to the positioned composer container. */
  anchorLeft: number;
  /** The positioned container (for viewport collision math). */
  containerRef: React.RefObject<HTMLElement | null>;
};

/**
 * Positions the listbox under the composer at `anchorLeft`, shifted left when
 * it would overflow the right viewport edge and never past the left edge.
 */
export function AutocompletePopover({
  anchorLeft,
  containerRef,
  ...listbox
}: AutocompletePopoverProps) {
  const popRef = React.useRef<HTMLDivElement>(null);
  const [left, setLeft] = React.useState(anchorLeft);

  // Collision math needs the rendered popover width — measurement, the one
  // thing React cannot derive. Runs on every plan/anchor change.
  React.useLayoutEffect(() => {
    const pop = popRef.current;
    const container = containerRef.current;
    if (!pop || !container) return;
    const containerLeft = container.getBoundingClientRect().left;
    const width = pop.getBoundingClientRect().width;
    const margin = 8;
    const maxLeft = window.innerWidth - margin - containerLeft - width;
    const minLeft = margin - containerLeft;
    setLeft(Math.max(minLeft, Math.min(anchorLeft, maxLeft)));
  }, [anchorLeft, containerRef, listbox.plan]);

  return (
    <div ref={popRef} className="absolute top-full z-50 mt-1" style={{ left }}>
      <AutocompleteListbox {...listbox} />
    </div>
  );
}
