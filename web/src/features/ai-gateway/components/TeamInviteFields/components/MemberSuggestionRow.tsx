import type { MouseEvent, ReactNode } from "react";

export type MemberSuggestionRowProps = {
  children: ReactNode;
};

/**
 * Row of quick-pick pills. Pressing a pill keeps focus in the email input, so
 * its blur does not commit half-typed text before the click lands.
 */
export function MemberSuggestionRow({ children }: MemberSuggestionRowProps) {
  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  return (
    <div
      className="ph-no-capture flex flex-wrap gap-2"
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
}
