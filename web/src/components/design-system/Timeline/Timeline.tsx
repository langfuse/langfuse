import { cva } from "class-variance-authority";
import type * as React from "react";

type TimelineProps = {
  children: React.ReactNode;
};

function TimelineRoot({ children }: TimelineProps) {
  return (
    <div className="relative w-full">
      {/* The last item draws no connector, so the line ends at its dot. */}
      <div className="flex flex-col gap-2 pl-5 [&>:last-child_[data-timeline-connector]]:hidden">
        {children}
      </div>
    </div>
  );
}

const timelineItemVariants = cva(
  "group relative flex w-full cursor-pointer flex-col gap-1 rounded-sm p-2",
  {
    variants: {
      isActive: {
        true: "bg-muted text-foreground",
        false: "hover:bg-muted/50",
      },
    },
    defaultVariants: {
      isActive: false,
    },
  },
);

type TimelineItemProps = {
  children: React.ReactNode;
  ref?: React.RefObject<HTMLDivElement | null>;
  isActive?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function TimelineItem({
  children,
  ref,
  isActive = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: TimelineItemProps) {
  return (
    <div
      ref={ref}
      className={timelineItemVariants({ isActive })}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-foreground-tertiary absolute top-3.25 -left-3.5 size-1.5 rounded-full" />
      {/* Connector to the next item's dot, inset 4px from both dots. */}
      <div
        data-timeline-connector
        className="dotted-line-y absolute top-5.75 -bottom-4.25 -left-3.5 w-1.5 bg-top"
      />

      {children}
    </div>
  );
}

const Timeline = Object.assign(TimelineRoot, {
  Item: TimelineItem,
});

export { Timeline };
