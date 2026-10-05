/**
 * Loading placeholders shaped like the trace detail surfaces, so content lands
 * where the placeholder was. Wrap them in `SkeletonGroup` for the reveal delay.
 */

import { Skeleton } from "@/src/components/ui/skeleton";
import { TabsBar, TabsBarList } from "@/src/components/ui/tabs-bar";
import { traceHeaderFrameClassName } from "@/src/features/traces/components/TraceHeader";
import { type TraceRenderContext } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { cn } from "@/src/utils/tailwind";

function TraceHeaderSkeleton({
  traceContext,
}: {
  traceContext: TraceRenderContext;
}) {
  return (
    <div className={traceHeaderFrameClassName(traceContext)}>
      <div className="flex h-5.5 items-center gap-4">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/** Detail panel: header, tab bar and three sections. */
export function DetailPanelSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="@container shrink-0 space-y-2 border-b p-2">
        <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between">
          <div className="flex h-7 items-center gap-2">
            <Skeleton className="size-6 rounded-sm" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex h-6 items-center gap-2 @2xl:mr-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex h-5.5 items-center gap-4">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <TabsBar value="preview" className="h-auto shrink-0">
        <TabsBarList className="w-full gap-8 px-4">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-12" />
        </TabsBarList>
      </TabsBar>
      <div className="flex flex-col gap-6 px-4 pt-4">
        {[0, 1, 2].map((section) => (
          <div key={section} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

const TREE_ROW_INDENTS = [
  "pl-3",
  "pl-7",
  "pl-11",
  "pl-11",
  "pl-7",
  "pl-11",
  "pl-15",
  "pl-11",
];

function NavigationPanelSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
        <Skeleton className="size-6" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="size-6" />
      </div>
      <div className="flex flex-col gap-1 py-1">
        {TREE_ROW_INDENTS.map((indent, index) => (
          <div
            key={index}
            className={cn("flex h-8 items-center gap-2 pr-3", indent)}
          >
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="ml-auto h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Whole trace body: header strip over the navigation and detail panels. */
export function TraceDetailBodySkeleton({
  traceContext,
  navigationCollapsed = false,
}: {
  traceContext: TraceRenderContext;
  /** Layouts that open with the navigation panel on its rail. */
  navigationCollapsed?: boolean;
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <TraceHeaderSkeleton traceContext={traceContext} />
      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "hidden shrink-0 border-r md:block",
            navigationCollapsed ? "w-10" : "w-2/5 max-w-md min-w-64",
          )}
        >
          {!navigationCollapsed && <NavigationPanelSkeleton />}
        </div>
        <div className="bg-background min-w-0 flex-1">
          <DetailPanelSkeleton />
        </div>
      </div>
    </div>
  );
}
