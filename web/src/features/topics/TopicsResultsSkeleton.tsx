import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";
import { type TopicsResultsView } from "./TopicsResultsViewSelect";

const TRACE_ROWS = 12;
const LEGEND_ROWS = 6;

/** Mirrors the layout of the selected results view, so nothing moves when the results land. */
export function TopicsResultsSkeleton({ view }: TopicsResultsSkeletonProps) {
  if (view === "grid") {
    return (
      <SkeletonGroup className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex min-h-48 min-w-0 shrink-0 basis-1/2 flex-col overflow-hidden lg:shrink lg:basis-3/5">
          <div className="flex h-12 shrink-0 items-center justify-end gap-0.5 px-4">
            <Skeleton className="size-6" />
            <Skeleton className="size-6" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t">
            <div className="flex min-h-0 flex-[2] p-4">
              <Skeleton className="flex-1" />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-4 gap-y-3 overflow-hidden border-t p-3.5">
              {Array.from({ length: LEGEND_ROWS }, (_, index) => (
                <Skeleton key={index} className="h-4" />
              ))}
            </div>
          </div>
        </div>
        <TraceListSkeleton divider="side" />
      </SkeletonGroup>
    );
  }
  return (
    <SkeletonGroup className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="m-4 grid min-h-48 min-w-0 shrink-0 basis-1/2 grid-cols-6 grid-rows-4 gap-2">
        <Skeleton className="col-span-3 row-span-4" />
        <Skeleton className="col-span-3 row-span-2" />
        <Skeleton className="col-span-2 row-span-2" />
        <Skeleton />
        <Skeleton />
      </div>
      <TraceListSkeleton divider="top" />
    </SkeletonGroup>
  );
}

function TraceListSkeleton({ divider }: { divider: "top" | "side" }) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        divider === "side" && "border-t lg:border-t-0 lg:border-l",
        divider === "top" && "border-t",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-7 w-32" />
      </div>
      {Array.from({ length: TRACE_ROWS }, (_, index) => (
        <div
          key={index}
          className="flex shrink-0 items-center gap-6 border-t px-4 py-2.5"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

type TopicsResultsSkeletonProps = {
  view: TopicsResultsView;
};
