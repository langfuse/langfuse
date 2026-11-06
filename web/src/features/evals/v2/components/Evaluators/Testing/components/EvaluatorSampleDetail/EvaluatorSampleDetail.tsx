import { useEffect, useMemo, useRef } from "react";
import { ArrowDown, ArrowUp, Check } from "@langfuse/icons";
import { StringParam, useQueryParam } from "use-query-params";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuController,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { selectTriggerClassName } from "@/src/components/ui/select";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import { cn } from "@/src/utils/tailwind";

const SAMPLE_LIST_KEY = "evaluator-samples";

function sampleName(
  observation: SampleObservation,
  sampleScope: "observation" | "trace",
) {
  if (sampleScope === "trace") {
    return observation.traceName || observation.name || observation.id;
  }
  return observation.name || observation.traceName || observation.id;
}

function sampleTime(observation: SampleObservation) {
  const date = new Date(observation.startTime);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function samplesLabel(count: number) {
  return count === 1 ? "1 sample" : `${count} samples`;
}

function sampleViewIntent(
  sampleScope: "observation" | "trace",
  selected: SampleObservation | null,
) {
  if (selected == null) return null;
  if (sampleScope === "trace")
    return `trace:${selected.traceId ?? selected.id}`;
  return `observation:${selected.id}`;
}

/**
 * One trace on screen. Arrows and the samples menu sit at the far right of
 * the trace header. Observation scope opens the matched span. Trace scope
 * opens Messages.
 */
export function EvaluatorSampleDetail({
  projectId,
  sampleScope,
  observations,
  selectedObservationId,
  pending,
  onSelect,
}: {
  projectId: string;
  sampleScope: "observation" | "trace";
  observations: SampleObservation[];
  selectedObservationId: string | null;
  pending: boolean;
  onSelect: (observation: SampleObservation | null) => void;
}) {
  const selected =
    observations.find(
      (observation) => observation.id === selectedObservationId,
    ) ?? null;
  const { setDetailPageList } = useDetailPageLists();
  const entries = useMemo(
    () => observations.map((observation) => ({ id: observation.id })),
    [observations],
  );
  useEffect(() => {
    setDetailPageList(SAMPLE_LIST_KEY, entries);
    return () => setDetailPageList(SAMPLE_LIST_KEY, []);
  }, [entries, setDetailPageList]);

  const [, setObservation] = useQueryParam("observation", StringParam);
  const [, setTraceView] = useQueryParam("traceView", StringParam);
  const intentRef = useRef<string | null>(null);
  const viewIntent = sampleViewIntent(sampleScope, selected);

  const detail = useTraceDetailData({
    projectId,
    traceId: selected?.traceId ?? undefined,
    timestamp: selected ? new Date(selected.startTime) : undefined,
    enabled: Boolean(selected?.traceId),
  });
  const traceName =
    detail.data?.name || selected?.traceName || selected?.name || "Sample";

  if (!selected) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-sm">
        {pending ? "Loading samples…" : "No samples in this time range."}
      </div>
    );
  }

  const selectSample = (observation: SampleObservation) => {
    onSelect(observation);
  };
  const sampleControls = (
    <div className="flex shrink-0 items-center gap-2">
      {observations.length > 1 ? (
        <DetailPageNav
          currentId={selected.id}
          listKey={SAMPLE_LIST_KEY}
          path={() => ""}
          onNavigate={(entry) => {
            const next = observations.find(
              (observation) => observation.id === entry.id,
            );
            if (next) selectSample(next);
          }}
        />
      ) : (
        <div className="flex flex-row gap-1">
          <Button
            type="button"
            variant="outline"
            aria-label="Navigate up"
            disabled
          >
            <ArrowUp size="base" color="default" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Navigate down"
            disabled
          >
            <ArrowDown size="base" color="default" />
          </Button>
        </div>
      )}
      <DropdownMenuController
        align="end"
        maxWidth="18rem"
        renderMenu={() =>
          observations.map((observation) => {
            const name = sampleName(observation, sampleScope);
            return (
              <DropdownMenuItem
                key={observation.id}
                onSelect={() => selectSample(observation)}
              >
                <Check
                  size="sm"
                  color="default"
                  __rawClassName={cn(
                    "mr-2 shrink-0",
                    observation.id === selected.id
                      ? "opacity-100"
                      : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1 truncate" title={name}>
                  {name}
                </span>
                <span className="text-muted-foreground ml-3 shrink-0 text-xs">
                  {sampleTime(observation)}
                </span>
              </DropdownMenuItem>
            );
          })
        }
      >
        {({ Trigger }) => (
          <Trigger asChild>
            <button
              type="button"
              className={cn(selectTriggerClassName, "w-auto shrink-0")}
              aria-label="Samples"
            >
              {samplesLabel(observations.length)}
              <DropdownIndicator size="sm" />
            </button>
          </Trigger>
        )}
      </DropdownMenuController>
    </div>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      ref={(element) => {
        if (
          !element ||
          viewIntent == null ||
          intentRef.current === viewIntent
        ) {
          return;
        }
        intentRef.current = viewIntent;
        if (sampleScope === "trace") {
          setTraceView("messages", "replaceIn");
          setObservation(undefined, "replaceIn");
          return;
        }
        setTraceView(undefined, "replaceIn");
        setObservation(selected.id, "replaceIn");
      }}
    >
      <div className="min-h-0 flex-1">
        <TraceDetailBody
          trace={detail.data}
          context="peek"
          showMessages
          preferredObservationId={
            sampleScope === "observation" ? selected.id : null
          }
          truncatedAtObservations={detail.truncatedAtObservations}
          isPlaceholderData={detail.isPlaceholderData}
          keySuffix={selected.traceId ?? selected.id}
          header={{
            variant: "page",
            headerProps: {
              title: traceName,
              itemType: "TRACE",
              actions: [
                {
                  id: "samples",
                  type: "custom",
                  pinned: true,
                  render: () => sampleControls,
                },
              ],
            },
          }}
        />
      </div>
    </div>
  );
}
