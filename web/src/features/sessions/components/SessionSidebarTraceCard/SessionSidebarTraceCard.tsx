import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

export function SessionSidebarTraceCard({
  title,
  isActive,
  children,
  number,
  onSelect,
  titleContent,
  action,
}: {
  title: string;
  isActive: boolean;
  children: ReactNode;
  number: string | number;
  onSelect: () => void;
  titleContent?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={title}
      className={cn(
        "group border-border hover:bg-muted/60 rounded-md border p-2 transition-colors duration-150",
        isActive && "border-primary-accent/50 bg-background dark:bg-muted",
      )}
    >
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-current={isActive ? "true" : undefined}
        >
          <span className="border-border bg-tertiary text-foreground flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm border px-0.5 font-mono text-[10px]">
            {number}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-bold"
            title={title}
          >
            {titleContent ?? title}
          </span>
        </button>
        {action}
      </div>
      {children}
    </div>
  );
}
