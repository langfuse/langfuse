import { cn } from "@/src/utils/tailwind";

function LoadingBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-[inherit] bg-[rgba(17,24,39,0.07)]",
        className,
      )}
    />
  );
}

function DashboardLoadingCard() {
  return (
    <div className="rounded-[8px] border border-[rgba(15,23,42,0.08)] bg-white p-3">
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <LoadingBlock className="h-6 w-28 rounded-[8px]" />
          <div className="flex items-center gap-2">
            <LoadingBlock className="size-7 rounded-[8px]" />
            <LoadingBlock className="size-7 rounded-[8px]" />
          </div>
        </div>
        <LoadingBlock className="h-20 w-full rounded-[8px] bg-[#f7f8fa]" />
      </div>
    </div>
  );
}

function DashboardLoadingPrimaryRail() {
  return (
    <div className="border-r border-[rgba(15,23,42,0.08)] bg-white px-3 py-4">
      <div className="grid justify-items-center gap-3">
        {["a", "b", "c", "d", "e"].map((id) => (
          <LoadingBlock className="size-10 rounded-[10px]" key={id} />
        ))}
      </div>
    </div>
  );
}

function DashboardLoadingSecondaryRail() {
  return (
    <div className="border-r border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-4">
      <div className="grid gap-4">
        <LoadingBlock className="h-9 w-full rounded-[8px] bg-white" />
        <div className="grid gap-2">
          <LoadingBlock className="h-8 w-full rounded-[8px]" />
          <LoadingBlock className="h-8 w-5/6 rounded-[8px]" />
          <LoadingBlock className="h-8 w-2/3 rounded-[8px]" />
        </div>
        <div className="mt-4 grid gap-2">
          <LoadingBlock className="h-5 w-24 rounded-[6px]" />
          <LoadingBlock className="h-7 w-full rounded-[8px]" />
          <LoadingBlock className="h-7 w-11/12 rounded-[8px]" />
        </div>
      </div>
    </div>
  );
}

function DashboardLoadingCanvasSurface() {
  return (
    <div className="min-h-0 rounded-[8px] border border-[rgba(15,23,42,0.08)] bg-white p-3">
      <div className="relative h-full overflow-hidden rounded-[8px] bg-[#fafafa]">
        <div className="absolute top-[10%] left-[8%] w-[22rem] max-w-[42%]">
          <DashboardLoadingCard />
        </div>
        <div className="absolute top-[26%] left-[46%] w-[22rem] max-w-[42%]">
          <DashboardLoadingCard />
        </div>
        <div className="absolute top-[58%] left-[24%] h-px w-[28%] bg-[rgba(15,23,42,0.12)]" />
        <div className="absolute top-[43%] left-[42%] h-px w-[20%] bg-[rgba(15,23,42,0.12)]" />
      </div>
    </div>
  );
}

function DashboardLoadingBottomPanel() {
  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr] rounded-[8px] border border-[rgba(15,23,42,0.08)] bg-white">
      <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-3 py-2">
        <LoadingBlock className="h-6 w-36 rounded-[8px]" />
        <LoadingBlock className="h-7 w-20 rounded-[8px]" />
      </div>
      <div className="grid gap-3 p-3">
        <LoadingBlock className="h-12 w-full rounded-[8px]" />
        <LoadingBlock className="h-12 w-11/12 rounded-[8px]" />
        <LoadingBlock className="h-12 w-10/12 rounded-[8px]" />
      </div>
    </div>
  );
}

function DashboardLoadingCanvasPane() {
  return (
    <div className="min-w-0 overflow-hidden bg-[#f7f8fa] p-3">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_minmax(12rem,0.42fr)] gap-3">
        <div className="flex items-center justify-between rounded-[8px] border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2">
          <LoadingBlock className="h-7 w-44 rounded-[8px]" />
          <div className="flex items-center gap-2">
            <LoadingBlock className="h-8 w-8 rounded-[8px]" />
            <LoadingBlock className="h-8 w-8 rounded-[8px]" />
          </div>
        </div>
        <DashboardLoadingCanvasSurface />
        <DashboardLoadingBottomPanel />
      </div>
    </div>
  );
}

function DashboardLoadingSidePanel() {
  return (
    <div className="border-l border-[rgba(15,23,42,0.08)] bg-[#fafafa] px-4 py-4">
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <LoadingBlock className="h-8 w-28 rounded-[8px]" />
          <LoadingBlock className="size-8 rounded-[8px]" />
        </div>
        {["a", "b", "c"].map((id) => (
          <div
            className="rounded-[8px] border border-[rgba(15,23,42,0.08)] bg-white p-2"
            key={id}
          >
            <div className="grid gap-2">
              <LoadingBlock className="h-8 w-full rounded-[8px]" />
              <LoadingBlock className="h-16 w-full rounded-[8px] bg-[#f7f8fa]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpielwieseDashboardLoadingSkeleton() {
  return (
    <div
      className="h-screen-with-banner isolate overflow-hidden bg-white [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-testid="spielwiese-loading-dashboard-skeleton"
    >
      <div className="grid h-full grid-cols-[4.75rem_minmax(0,16rem)_minmax(0,1fr)_20rem] bg-white">
        <DashboardLoadingPrimaryRail />
        <DashboardLoadingSecondaryRail />
        <DashboardLoadingCanvasPane />
        <DashboardLoadingSidePanel />
      </div>
    </div>
  );
}
