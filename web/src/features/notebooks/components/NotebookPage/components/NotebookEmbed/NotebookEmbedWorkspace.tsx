import type { ReactNode } from "react";

export function NotebookEmbedWorkspace({
  kind,
  children,
}: {
  kind: "trace" | "session";
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={kind === "trace" ? "Trace workspace" : "Session workspace"}
      className="h-[min(75dvh,48rem)] min-h-96 min-w-0 overflow-auto rounded-md border"
    >
      {children}
    </div>
  );
}
