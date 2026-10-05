import { type ReactNode } from "react";

/** Padded container shared by the trace and observation detail headers. */
export function DetailViewHeaderShell({ children }: { children: ReactNode }) {
  return (
    <div className="@container shrink-0 space-y-1.5 pt-3 pr-2 pb-1 pl-4">
      {children}
    </div>
  );
}
