import { useMemo, useEffect, useCallback } from "react";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { StringParam, useQueryParam } from "use-query-params";
import { useQueries } from "@tanstack/react-query";
import { type JsonNested } from "@langfuse/shared";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import {
  normalizeExpansionState,
  denormalizeExpansionState,
} from "@/src/components/trace2/contexts/json-expansion-utils";
import { Download } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { downloadTraceAsJson as downloadTraceUtil } from "@/src/components/trace2/lib/download-trace";

export interface TraceLogViewProps {
  observations: ObservationReturnTypeWithMetadata[];
  traceId: string;
  projectId: string;
  currentView: "pretty" | "json";
  trace: {
    id: string;
    [key: string]: unknown;
  };
}

export const TraceLogView = ({
  observations,
  traceId,
  projectId,
  currentView,
  trace,
}: TraceLogViewProps) => {
  const [currentObservationId] = useQueryParam("observation", StringParam);
  const [selectedTab] = useQueryParam("view", StringParam);
  const utils = api.useUtils();
  const { expansionState, setFieldExpansion } = useJsonExpansion();

  // Load all observations with their input/output for the log view
  const observationsWithIO = useQueries({
    queries: observations.map((obs) =>
      utils.observations.byId.queryOptions({
        observationId: obs.id,
        startTime: obs.startTime,
        traceId: traceId,
        projectId: projectId,
      }),
    ),
  });

  const logData = useMemo(() => {
    // Sort observations by start time
    const sortedObservations = [...observations].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    const allObsData: Record<
      string,
      {
        id: string;
        type: string;
        name: string | null;
        startTime: string;
        endTime: string | null;
        latency: number | null;
        level: string;
        parentObservationId: string | null;
        model: string | null;
        modelParameters:
          | string
          | number
          | boolean
          | JsonNested[]
          | { [key: string]: JsonNested }
          | null;
        promptName: string | null;
        promptVersion: number | null;
        input: unknown;
        output: unknown;
        metadata: unknown;
        statusMessage: string | null;
        inputUsage: number;
        outputUsage: number;
        totalUsage: number;
        totalCost: number | null;
      }
    > = {};

    const idToDisplayName = new Map<string, string>();

    sortedObservations.forEach((obs) => {
      const index = observations.findIndex((o) => o.id === obs.id);
      const obsWithIO = observationsWithIO[index]?.data;

      const displayName = `${obs.name || obs.type} (${obs.id.substring(0, 8)})`;
      idToDisplayName.set(obs.id, displayName);

      allObsData[displayName] = {
        id: obs.id,
        type: obs.type,
        name: obs.name,
        startTime: obs.startTime.toISOString(),
        endTime: obs.endTime?.toISOString() || null,
        latency: obs.latency,
        level: obs.level,
        parentObservationId: obs.parentObservationId,
        model: obs.model,
        modelParameters: obs.modelParameters,
        promptName: obs.promptName,
        promptVersion: obs.promptVersion,
        input: obsWithIO?.input,
        output: obsWithIO?.output,
        metadata: obsWithIO?.metadata,
        statusMessage: obs.statusMessage,
        inputUsage: obs.inputUsage,
        outputUsage: obs.outputUsage,
        totalUsage: obs.totalUsage,
        totalCost: obs.totalCost,
      };
    });

    return { data: allObsData, idToDisplayName };
  }, [observations, observationsWithIO]);

  // Check if any data is still loading
  const isLoading = observationsWithIO.some((query) => query.isPending);

  // Scroll to observation when clicked in trace tree
  useEffect(() => {
    if (currentObservationId && selectedTab === "log") {
      const displayName = logData.idToDisplayName.get(currentObservationId);
      if (displayName) {
        // Convert display name format: hyphens to dots to match convertRowIdToKeyPath
        const keyPathFormat = displayName.replace(/-/g, ".");
        const element = document.querySelector(
          `[data-observation-id="${keyPathFormat}"]`,
        );
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  }, [currentObservationId, selectedTab, logData]);

  // Get top-level observation keys for denormalization
  const observationKeys = useMemo(
    () => Object.keys(logData.data),
    [logData.data],
  );

  // Convert normalized state from context to actual state with observation IDs
  const denormalizedState = useMemo(
    () => denormalizeExpansionState(expansionState.log, observationKeys),
    [expansionState.log, observationKeys],
  );

  // download includes trace + observations with full I/O
  const downloadLogAsJson = useCallback(() => {
    const observationsWithFullData = observations.map((obs, index) => {
      const obsWithIO = observationsWithIO[index]?.data;
      return {
        ...obs,
        input: obsWithIO?.input,
        output: obsWithIO?.output,
        metadata: obsWithIO?.metadata,
      };
    });

    downloadTraceUtil({
      trace,
      observations: observationsWithFullData,
      filename: `trace-with-observations-${traceId}.json`,
    });
  }, [trace, observations, observationsWithIO, traceId]);

  // Only render the actual log view when all data is loaded
  // prevents partial rendering and improves performance
  if (isLoading) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden px-2">
        <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
          <div className="rounded-md border p-4">
            <div className="text-sm text-muted-foreground">
              Loading {observations.length} observations...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden pr-2">
      <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto px-2">
        <PrettyJsonView
          key="trace-log-view"
          title="Concatenated Observation Log"
          json={logData.data}
          currentView={currentView}
          isLoading={false}
          showNullValues={false}
          externalExpansionState={denormalizedState}
          onExternalExpansionChange={(expansion) =>
            setFieldExpansion("log", normalizeExpansionState(expansion))
          }
          stickyTopLevelKey={true}
          showObservationTypeBadge={true}
          controlButtons={
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadLogAsJson}
              title="Download trace log as JSON"
              className="-mr-2"
            >
              <Download className="h-3 w-3" />
            </Button>
          }
        />
      </div>
    </div>
  );
};
