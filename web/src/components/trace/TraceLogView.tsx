import { useMemo, useEffect, useCallback } from "react";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { StringParam, useQueryParam } from "use-query-params";
import { useQueries } from "@tanstack/react-query";
import { type JsonNested } from "@langfuse/shared";
import { useJsonExpansion } from "@/src/components/trace/JsonExpansionContext";
import { Download } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { downloadTraceAsJson as downloadTraceUtil } from "@/src/components/trace/lib/helpers";

// for Json Expansion Context State (keeps expanded/collapsed state across traces)

// Remove observation ID from keys for persistent expansion state and convert hyphens to dots (PrettyJsonView internal format)
// Example: "natural-language-filter (abc12345)" -> "natural.language.filter"
const normalizeKey = (key: string): string => {
  return key.replace(/-/g, ".").replace(/\s*\([a-f0-9]{8}\)/, "");
};

// Convert normalized expansion state to actual state with observation IDs
const denormalizeExpansionState = (
  normalizedState: Record<string, boolean> | boolean,
  observationKeys: string[],
): Record<string, boolean> | boolean => {
  if (typeof normalizedState === "boolean") return normalizedState;

  // Build mapping: normalized observation name -> actual observation name(s)
  const normalizedToActual = new Map<string, string[]>();
  observationKeys.forEach((actualKey) => {
    const normalized = normalizeKey(actualKey);
    if (!normalizedToActual.has(normalized)) {
      normalizedToActual.set(normalized, []);
    }
    // store the normalized
    normalizedToActual.get(normalized)!.push(actualKey.replace(/-/g, "."));
  });

  const denormalized: Record<string, boolean> = {};

  Object.entries(normalizedState).forEach(([normalizedKey, value]) => {
    // First check if this is a top-level observation key (no nested path)
    if (normalizedToActual.has(normalizedKey)) {
      const actualKeys = normalizedToActual.get(normalizedKey)!;
      actualKeys.forEach((actualKey) => {
        denormalized[actualKey] = value;
      });
      return;
    }

    // Otherwise split key into top-level observation and nested path
    const parts = normalizedKey.split(".");
    const topLevelNormalized = parts[0];
    const restOfPath = parts.slice(1).join(".");

    // Find all actual observation keys that match this normalized key
    const actualTopLevelKeys = normalizedToActual.get(topLevelNormalized) || [];

    actualTopLevelKeys.forEach((actualTopLevel) => {
      const actualKey = restOfPath
        ? `${actualTopLevel}.${restOfPath}`
        : actualTopLevel;
      denormalized[actualKey] = value;
    });
  });

  return denormalized;
};

// for session storage, convert current expansion state to normalized state
const normalizeExpansionState = (
  actualState: Record<string, boolean> | boolean,
): Record<string, boolean> | boolean => {
  if (typeof actualState === "boolean") return actualState;

  const normalized: Record<string, boolean> = {};

  Object.entries(actualState).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key);
    normalized[normalizedKey] = value;
  });

  return normalized;
};

export const TraceLogView = ({
  observations,
  traceId,
  projectId,
  currentView,
  trace,
}: {
  observations: ObservationReturnTypeWithMetadata[];
  traceId: string;
  projectId: string;
  currentView: "pretty" | "json";
  trace: {
    id: string;
    [key: string]: unknown;
  };
}) => {
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
      <div className="flex h-full w-full flex-col overflow-hidden pr-3">
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
    <div className="flex h-full w-full flex-col overflow-hidden pr-3">
      <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
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
