import { Spinner } from "@/src/components/design-system/Spinner/Spinner";

/**
 * Shown while the detail query is retrying a miss — the trace may still be
 * ingesting. Distinct from the plain first-paint loader so a normal open does
 * not look like an ingest lag.
 */
export function TraceWaitingForArrival() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <Spinner size="xl" variant="muted" />
      <h1 className="text-xl font-bold">Waiting for trace</h1>
      <p className="text-muted-foreground max-w-sm text-center text-sm">
        This trace may still be ingesting. Checking again shortly…
      </p>
    </div>
  );
}
