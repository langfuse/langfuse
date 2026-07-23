/**
 * Shared building blocks for the trace/observation details panel's
 * inspector design language: mono uppercase eyebrow labels, the overview
 * metrics grid, observation type chips, and zone-divider bands.
 *
 * Purely presentational — no data fetching, no behavior.
 */

import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

/** Mono uppercase eyebrow label used across the details panel. */
export const EyebrowLabel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      "text-muted-foreground font-mono text-[9px] font-bold tracking-[0.08em] uppercase",
      className,
    )}
  >
    {children}
  </span>
);

/** 8px full-width band separating the panel's visual zones. */
export const ZoneDivider = () => (
  <div className="bg-muted/60 h-2 shrink-0 border-y" />
);

/** Short type labels for the header chip, per the inspector design. */
const TYPE_CHIP_LABELS: Record<string, string> = {
  GENERATION: "GEN",
};

/** Mono uppercase type chip (GEN / SPAN / TOOL / EVENT / TRACE / ...). */
export const TypeChip = ({
  type,
  className,
}: {
  type: string;
  className?: string;
}) => (
  <span
    className={cn(
      "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide uppercase",
      // GEN and TRACE get the slightly darker fill, per the design.
      type === "GENERATION" || type === "TRACE"
        ? "bg-muted text-foreground"
        : "bg-muted/40 text-muted-foreground",
      className,
    )}
    title={type}
  >
    {TYPE_CHIP_LABELS[type] ?? type}
  </span>
);

/**
 * Overview metrics grid: two label+value columns, baseline-aligned.
 * Children are `OverviewRow`s (each renders a label cell + a value cell).
 */
export const OverviewGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
    {children}
  </div>
);

/** One metric inside `OverviewGrid`: eyebrow label + mono value. */
export const OverviewRow = ({
  label,
  title,
  className,
  children,
}: {
  label: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) => (
  <>
    <EyebrowLabel>{label}</EyebrowLabel>
    <span
      className={cn(
        "min-w-0 truncate font-mono text-[11px] font-bold",
        className,
      )}
      title={title}
    >
      {children}
    </span>
  </>
);
