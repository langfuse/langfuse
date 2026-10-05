import { ArrowRight, FlaskConical, PanelRightClose } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";

export function EvaluatorSetupLoadingState({
  mode,
}: {
  mode: "create" | "edit";
}) {
  const isCreating = mode === "create";

  return (
    <div className="@container flex min-h-0 flex-1 flex-col" aria-busy="true">
      <span className="sr-only" role="status">
        Loading evaluator
      </span>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto @3xl:grid @3xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)] @3xl:overflow-hidden">
        <div className="shrink-0 p-6 @3xl:min-h-0 @3xl:overflow-hidden">
          <div className="flex gap-3">
            <div className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              1
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">Define evaluation</h2>
              <Skeleton className="mt-2 h-3 w-3/4 max-w-lg" />
              <Skeleton className="mt-2 h-3 w-1/2 max-w-sm" />
              <Skeleton className="mt-6 h-64 w-full" />
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <div className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              2
            </div>
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="mt-2 h-3 w-2/3 max-w-md" />
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </div>
        </div>

        <aside className="flex shrink-0 flex-col overflow-hidden border-t @3xl:min-h-0 @3xl:border-t-0 @3xl:border-l">
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-6">
            <div className="flex items-center gap-2">
              <FlaskConical className="icon-base" />
              <h2 className="font-bold">Test with sample observations</h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled
              aria-label="Collapse test panel"
            >
              <PanelRightClose className="icon-base" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-6">
            <section>
              <h3 className="text-sm font-bold">Filter observations</h3>
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-4 h-9 w-full" />
            </section>
            <section className="min-h-0">
              <h3 className="text-sm font-bold">Matching observations</h3>
              <Skeleton className="mt-2 h-3 w-2/3" />
              <Skeleton className="mt-4 h-40 w-full" />
            </section>
            <section>
              <h3 className="text-sm font-bold">Test the evaluator</h3>
              <Skeleton className="mt-4 h-28 w-full" />
            </section>
          </div>
        </aside>
      </div>

      <div className="flex shrink-0 items-center gap-4 border-t px-6 py-3">
        {isCreating ? (
          <p className="text-muted-foreground min-w-0 flex-1 text-sm">
            Next: attach a rule to run this evaluator on incoming observations.
          </p>
        ) : null}
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="outline" disabled>
            Close
          </Button>
          <Button type="button" disabled className="gap-1.5">
            {isCreating ? "Create evaluator" : "Save changes"}
            {isCreating ? (
              <ArrowRight className="icon-base shrink-0" aria-hidden="true" />
            ) : null}
          </Button>
        </div>
      </div>
    </div>
  );
}
