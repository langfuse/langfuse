import { useMemo, useEffect } from "react";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { StringParam, useQueryParam } from "use-query-params";
import { useQueries } from "@tanstack/react-query";
import { type JsonNested } from "@langfuse/shared";

export const TraceLogView = ({
  observations,
  traceId,
  projectId,
  currentView,
}: {
  observations: ObservationReturnTypeWithMetadata[];
  traceId: string;
  projectId: string;
  currentView: "pretty" | "json";
}) => {
  const [currentObservationId] = useQueryParam("observation", StringParam);
  const [selectedTab] = useQueryParam("view", StringParam);
  const utils = api.useUtils();

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
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }, [currentObservationId, selectedTab, logData]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden pr-3">
      <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
        <PrettyJsonView
          key="trace-log-view"
          title="Concatenated Observation Log"
          json={logData.data}
          currentView={currentView}
          isLoading={isLoading}
          showNullValues={false}
        />
      </div>
    </div>
  );
};
