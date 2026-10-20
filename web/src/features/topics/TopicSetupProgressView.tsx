import { Progress } from "@/src/components/design-system/Progress/Progress";

/** First-run progress. Grouping is a separate run and does not start from this view. */
export function TopicSetupProgressView({
  complete,
  requested,
}: {
  complete: number;
  requested: number;
}) {
  const value = requested > 0 ? Math.round((complete / requested) * 100) : 0;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-7 overflow-y-auto pt-12">
      <h2 className="text-xl font-bold">Getting your first topics</h2>
      <div className="bg-card flex w-full flex-col rounded-lg border">
        <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 border-b px-5 py-4">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs">
            1
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold">Summarize traces</span>
              <span className="text-muted-foreground font-mono text-xs">
                {complete.toLocaleString("en-US")} /{" "}
                {requested.toLocaleString("en-US")}
              </span>
            </div>
            <Progress value={value} />
          </div>
        </div>
        <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 px-5 py-4 opacity-60">
          <div className="text-muted-foreground flex size-6 items-center justify-center rounded-full border text-xs">
            2
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold">Group into topics</span>
            <span className="text-muted-foreground text-xs">
              Run Generate topics after summaries finish.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
