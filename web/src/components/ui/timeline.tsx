import { cn } from "@/src/utils/tailwind";

interface TimelineProps {
  children: React.ReactNode;
  className?: string;
}

export function Timeline({ children, className }: TimelineProps) {
  return (
    <div className={cn("relative w-full", className)}>
      {/* Timeline line */}
      <div className="bg-border absolute left-2 mt-4 h-[calc(100%-16px)] w-px" />

      {/* Timeline items container */}
      <div className="pl-4">{children}</div>
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
        isActive ? "bg-muted" : "hover:bg-primary-foreground",
        className,
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Timeline dot */}
      <div
        className={cn(
          "fill bg-border absolute top-3 -left-[11.5px] h-2 w-2 rounded-full",
          isActive ? "border-primary" : "border-muted-foreground",
        )}
      />

      {children}
    </div>
  );
}
