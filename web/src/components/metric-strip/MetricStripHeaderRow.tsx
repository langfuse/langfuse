import { type ReactNode } from "react";

/** The controls row above the plot: metric dropdown, then its annotations. */
export function MetricStripHeaderRow({ children }: { children: ReactNode }) {
  return <div className="flex items-baseline gap-1.5">{children}</div>;
}
