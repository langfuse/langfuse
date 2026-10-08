/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/utils/tailwind";

interface TimelineProps {
  children: React.ReactNode;
  className?: string;
}

export function Timeline({ children, className }: TimelineProps) {
  return (
    <div className={cn("relative w-full", className)}>
      {/* The last item draws no connector, so the line ends at its dot. */}
      <div className="pl-5 [&>:last-child_[data-timeline-connector]]:hidden">
        {children}
      </div>
    </div>
  );
}

interface TimelineItemProps {
  children: React.ReactNode;
  ref?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  isActive?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function TimelineItem({
  children,
  ref,
  isActive,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className,
}: TimelineItemProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "group relative mb-2 flex w-full cursor-pointer flex-col gap-1 rounded-sm p-2",
        isActive ? "bg-muted text-foreground" : "hover:bg-muted/50",
        className,
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Timeline dot */}
      <div className="bg-foreground-tertiary absolute top-3.25 left-[-14.5px] size-1.5 rounded-full" />
      {/* Connector to the next item's dot, inset 4px from both dots. */}
      <div
        data-timeline-connector
        className="dotted-line-y absolute top-5.75 -bottom-4.25 -left-3 w-px"
      />

      {children}
    </div>
  );
}
