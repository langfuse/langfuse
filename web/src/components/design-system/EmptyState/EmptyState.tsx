import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import {
  Drawing,
  type DrawingMotion,
} from "../internal/Illustrations/drawings/Drawing";
import type { DrawingName } from "../internal/Illustrations/drawings/designs";
import { HOST_ATTRIBUTE } from "../internal/Illustrations/engine/usePlayback";

const emptyStateVariants = cva(
  "flex flex-col items-center gap-1 text-center [&>[data-slot=empty-state-actions]]:mt-3 [&>[data-slot=empty-state-illustration]]:mb-2",
  {
    variants: {
      size: {
        sm: "px-3 py-4 [&>[data-slot=empty-state-description]]:text-xs [&>[data-slot=empty-state-illustration]]:h-20 [&>[data-slot=empty-state-title]]:text-sm",
        md: "px-4 py-6 [&>[data-slot=empty-state-description]]:text-sm [&>[data-slot=empty-state-illustration]]:h-28 [&>[data-slot=empty-state-title]]:text-base",
        lg: "px-4 py-10 [&>[data-slot=empty-state-description]]:text-sm [&>[data-slot=empty-state-illustration]]:h-40 [&>[data-slot=empty-state-title]]:text-base",
        xl: "px-6 py-16 [&>[data-slot=empty-state-description]]:text-base [&>[data-slot=empty-state-illustration]]:h-64 [&>[data-slot=empty-state-title]]:text-lg",
      },
    },
  },
);

type EmptyStateProps = {
  /** sm for table and panel slots, md for pages, lg for a page with nothing else on it, xl for a full-screen first run. */
  size: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
};

type EmptyStateIllustrationProps = {
  drawing: DrawingName;
  /** subtle builds once in view and moves while hovered; hover rebuilds on every hover; off stays still. */
  motion: DrawingMotion;
  /** The floor under the drawing: a fading grid, a tinted panel, or nothing. */
  backdrop: "grid" | "panel" | "none";
  /** highlight paints the drawing's raised element in the primary accent. */
  accent: "none" | "highlight";
};

type EmptyStateTitleProps = {
  /** The heading level that fits the page outline around the empty state. */
  level: "h2" | "h3" | "h4";
  children: ReactNode;
};

type EmptyStateDescriptionProps = {
  children: ReactNode;
};

type EmptyStateActionsProps = {
  /** Design-system Buttons and TextLinks, main action first. */
  children: ReactNode;
};

/** What a place looks like before it has anything in it: a drawing of the empty object, a title, why, and what to do next. Hovering anywhere on it plays the drawing. */
function EmptyStateRoot({ size, children }: EmptyStateProps) {
  return (
    <div className={emptyStateVariants({ size })} {...{ [HOST_ATTRIBUTE]: "" }}>
      {children}
    </div>
  );
}

/** Decorative: hidden from screen readers, since the title and description say what it shows. */
function EmptyStateIllustration({
  drawing,
  motion,
  backdrop,
  accent,
}: EmptyStateIllustrationProps) {
  return (
    <div data-slot="empty-state-illustration" className="flex justify-center">
      <Drawing
        drawing={drawing}
        motion={motion}
        backdrop={backdrop}
        accent={accent}
      />
    </div>
  );
}

function EmptyStateTitle({ level: Heading, children }: EmptyStateTitleProps) {
  return (
    <Heading
      data-slot="empty-state-title"
      className="text-foreground font-bold"
    >
      {children}
    </Heading>
  );
}

function EmptyStateDescription({ children }: EmptyStateDescriptionProps) {
  return (
    <p
      data-slot="empty-state-description"
      className="text-muted-foreground max-w-sm"
    >
      {children}
    </p>
  );
}

function EmptyStateActions({ children }: EmptyStateActionsProps) {
  return (
    <div
      data-slot="empty-state-actions"
      className="flex flex-wrap items-center justify-center gap-2"
    >
      {children}
    </div>
  );
}

const EmptyState = Object.assign(EmptyStateRoot, {
  Illustration: EmptyStateIllustration,
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
  Actions: EmptyStateActions,
});

export { EmptyState };
