import { type ReactNode } from "react";

/** Padded container shared by the trace and observation detail headers. */
export function DetailViewHeaderShell({ children }: { children: ReactNode }) {
  return (
    <div className="@container shrink-0 space-y-1.5 px-4 pt-3 pb-2">
      {children}
    </div>
  );
}
