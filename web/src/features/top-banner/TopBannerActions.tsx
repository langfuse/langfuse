import { type ReactNode } from "react";

/** Lays out several `TopBannerView` actions in one row that keeps its width. */
export function TopBannerActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 self-end sm:self-auto">
      {children}
    </div>
  );
}
