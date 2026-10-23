import { cva } from "class-variance-authority";
import {
  Drawing,
  type DrawingMotion,
} from "../internal/Illustrations/drawings/Drawing";
import type { DrawingName } from "../internal/Illustrations/drawings/designs";

const spotIllustrationVariants = cva("flex", {
  variants: {
    size: { sm: "h-20", md: "h-28", lg: "h-40" },
  },
});

type SpotIllustrationProps = {
  drawing: DrawingName;
  /** sm for a card corner, md beside a block of text, lg as a section's picture: EmptyState's sm, md and lg heights. */
  size: "sm" | "md" | "lg";
  /** subtle builds once in view and moves while hovered; hover rebuilds on every hover; off stays still. */
  motion: DrawingMotion;
  /** The floor under the drawing: a fading grid, a tinted panel, or nothing. */
  backdrop: "grid" | "panel" | "none";
  /** highlight paints the drawing's raised element in the primary accent. */
  accent: "none" | "highlight";
};

/**
 * One empty-state drawing on its own, for a card or a step outside an EmptyState. Decorative: the text next to it
 * carries the meaning. Inside an IllustrationHost, hovering the card plays it.
 */
export function SpotIllustration({
  drawing,
  size,
  motion,
  backdrop,
  accent,
}: SpotIllustrationProps) {
  return (
    <div className={spotIllustrationVariants({ size })}>
      <Drawing
        drawing={drawing}
        motion={motion}
        backdrop={backdrop}
        accent={accent}
      />
    </div>
  );
}
