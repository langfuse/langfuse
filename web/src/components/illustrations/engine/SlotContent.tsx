import type { Slot } from "./slots";

type SlotContentProps = { slot: Slot };

/** A text slot's content, for inside a <text>; when it was truncated, hovering shows the full text. */
export function SlotContent({ slot }: SlotContentProps) {
  return (
    <>
      {slot.text}
      {slot.text !== slot.full && <title>{slot.full}</title>}
    </>
  );
}
