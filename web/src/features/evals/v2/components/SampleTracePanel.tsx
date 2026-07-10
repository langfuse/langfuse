import { useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type PreviewData } from "@/src/features/evals/hooks/usePreviewData";
import {
  pickRootObservation,
  type ScopeTargetObject,
} from "@/src/features/evals/v2/lib/useSourceObject";
import { api } from "@/src/utils/api";
import { EvalTargetObject } from "@langfuse/shared";

/**
 * What the sample section displays, driven by the run-scope data source:
 * - trace: the trace's own input/output; when a trace carries none (newer
 *   SDKs put the payload on the root span), fall back to the root
 *   observation's io with a note.
 * - event (Observations): the root observation's io — the same object the
 *   variable mapping resolves against.
 */
function useSampleDisplay({
  projectId,
  previewData,
  targetObject,
}: {
  projectId: string;
  previewData: PreviewData | null;
  targetObject: ScopeTargetObject;
}) {
  const trace =
    previewData?.type === EvalTargetObject.TRACE ? previewData.trace : null;

  const wantsObservation = targetObject === "event";
  const traceMissingIo =
    trace !== null && trace.input == null && trace.output == null;
  const needsObservation = wantsObservation || traceMissingIo;

  const observation = useMemo(() => {
    if (!trace || !needsObservation) return null;
    return pickRootObservation(
      (trace.observations as Record<string, unknown>[] | undefined) ?? [],
    );
  }, [trace, needsObservation]);

  const observationQuery = api.observations.byId.useQuery(
    {
      observationId: (observation?.id as string) ?? "",
      startTime: (observation?.startTime as Date | null) ?? null,
      traceId: trace?.id ?? "",
      projectId,
    },
    { enabled: Boolean(needsObservation && observation && trace) },
  );

  if (!trace) {
    return {
      input: null,
      output: null,
      metadata: null,
      note: null,
      isLoading: false,
    };
  }

  if (wantsObservation) {
    return {
      input: observationQuery.data?.input ?? null,
      output: observationQuery.data?.output ?? null,
      metadata: observationQuery.data?.metadata ?? null,
      note: observation
        ? `Showing the root observation ("${String(observation.name ?? observation.id)}") of the sample trace.`
        : "This trace has no observations to sample from.",
      isLoading: Boolean(observation) && observationQuery.isLoading,
    };
  }

  if (traceMissingIo && observation) {
    return {
      input: observationQuery.data?.input ?? null,
      output: observationQuery.data?.output ?? null,
      metadata: observationQuery.data?.metadata ?? null,
      note: "This trace has no trace-level input/output — showing the root observation's instead.",
      isLoading: observationQuery.isLoading,
    };
  }

  return {
    input: trace.input,
    output: trace.output,
    metadata: trace.metadata,
    note: null,
    isLoading: false,
  };
}

export type SampleTraceOption = {
  id: string;
  name: string | null;
  timestamp: Date;
};

/**
 * Compact trace picker (prev/next + timestamp select + trace link) rendered
 * inline in the section header, next to the section title.
 */
export function SampleTraceSelector({
  projectId,
  traces,
  selectedTraceId,
  onSelectTraceId,
}: {
  projectId: string;
  traces: SampleTraceOption[];
  selectedTraceId: string | null;
  onSelectTraceId: (traceId: string) => void;
}) {
  const selectedIndex = traces.findIndex((t) => t.id === selectedTraceId);
  const selected = selectedIndex >= 0 ? traces[selectedIndex] : undefined;

  const goTo = (offset: number) => {
    const next = traces[selectedIndex + offset];
    if (next) onSelectTraceId(next.id);
  };

  if (traces.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={selectedIndex <= 0}
        onClick={() => goTo(-1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={selectedIndex < 0 || selectedIndex >= traces.length - 1}
        onClick={() => goTo(1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
      <Select value={selectedTraceId ?? ""} onValueChange={onSelectTraceId}>
        <SelectTrigger className="h-6 w-fit shrink-0 gap-1 px-2 text-xs">
          {/* Short label in the trigger; full timestamps in the dropdown. */}
          <SelectValue placeholder="Select a trace...">
            {selected
              ? selected.timestamp.toLocaleString(undefined, {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {traces.map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.timestamp.toLocaleString()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedTraceId && (
        <Button asChild type="button" variant="ghost" size="icon-xs">
          <Link
            href={`/project/${projectId}/traces/${selectedTraceId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}

export function SampleTracePanel({
  projectId,
  traces,
  isLoadingTraces,
  previewData,
  isLoadingPreview,
  targetObject,
}: {
  projectId: string;
  traces: SampleTraceOption[];
  isLoadingTraces: boolean;
  previewData: PreviewData | null;
  isLoadingPreview: boolean;
  targetObject: ScopeTargetObject;
}) {
  const display = useSampleDisplay({ projectId, previewData, targetObject });

  if (isLoadingTraces) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (traces.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No traces found in this project yet. Ingest traces to preview and test
        your rule against real data.
      </p>
    );
  }

  const trace =
    previewData?.type === EvalTargetObject.TRACE ? previewData.trace : null;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {isLoadingPreview || display.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : trace ? (
        <div className="flex flex-col gap-2">
          {display.note && (
            <p className="text-muted-foreground text-xs">{display.note}</p>
          )}
          <PrettyJsonView
            json={display.input}
            title="Input"
            currentView="pretty"
            collapseStringsAfterLength={250}
          />
          <PrettyJsonView
            json={display.output}
            title="Output"
            currentView="pretty"
            collapseStringsAfterLength={250}
          />
          <PrettyJsonView
            json={display.metadata}
            title="Metadata"
            currentView="pretty"
            collapseStringsAfterLength={250}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Select a trace to preview its data.
        </p>
      )}
    </div>
  );
}
