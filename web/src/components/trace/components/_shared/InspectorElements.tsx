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
      // Mock eyebrow: mono 10px, 0.05em tracking, regular weight.
      "text-muted-foreground font-mono text-[10px] tracking-[0.05em] uppercase",
      className,
    )}
  >
    {children}
  </span>
);

/** Dashed hairline separating the panel's visual zones (mock). */
export const ZoneDivider = () => (
  <div className="border-border-contrast shrink-0 border-t border-dashed" />
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
 * Overview metrics grid: two columns of stacked label-over-value cells
 * (the mock's metadata grid). Children are `OverviewRow`s.
 */
export const OverviewGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</div>
);

/** One metric cell inside `OverviewGrid`: eyebrow label over a mono value. */
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
  <div className="min-w-0">
    <div>
      <EyebrowLabel>{label}</EyebrowLabel>
    </div>
    <div
      className={cn(
        "text-primary mt-0.5 min-w-0 truncate font-mono text-[13px]",
        className,
      )}
      title={title}
    >
      {children}
    </div>
  </div>
);
