import type { ComponentProps, ReactNode } from "react";
import { TraceLayoutDesktop } from "./TraceLayoutDesktop";

export function TraceWorkspacePanels({
  navigation,
  detail,
  ...layout
}: Omit<ComponentProps<typeof TraceLayoutDesktop>, "children"> & {
  navigation: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div
      className="h-full"
      data-trace-review-open={layout.reviewOpen || undefined}
    >
      <TraceLayoutDesktop key={layout.groupId} {...layout}>
        <TraceLayoutDesktop.NavigationPanel>
          {navigation}
        </TraceLayoutDesktop.NavigationPanel>
        <TraceLayoutDesktop.ResizeHandle />
        <TraceLayoutDesktop.DetailPanel>
          {detail}
        </TraceLayoutDesktop.DetailPanel>
      </TraceLayoutDesktop>
    </div>
  );
}
