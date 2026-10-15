import { useRef, useState } from "react";
import { api, type RouterInputs } from "@/src/utils/api";
import { type TopicFacet, type TopicFacetRef } from "@langfuse/shared/topics";
import { type ConfigureTopicsSettingsInput } from "./TopicModelSettings";
import { type RegenerateTopics } from "./useRegenerateTopics";
import { type TimeRange } from "@/src/utils/date-range-utils";

export function useTopicPipelineForm({
  projectId,
  facets,
  canWrite,
  onTriggered,
  generationTimeRange,
  onGenerationTimeRangeChange,
  regenerate,
  settings,
  configurationError,
  running,
  onConfigure,
}: {
  projectId: string;
  facets: TopicFacet[];
  canWrite: boolean;
  onTriggered: (id: string) => void;
  generationTimeRange: TimeRange;
  onGenerationTimeRangeChange: (range: TimeRange) => void;
  regenerate: RegenerateTopics;
  settings: ConfigureTopicsSettingsInput | null;
  configurationError: string | null;
  running: boolean;
  onConfigure: () => void;
}) {
  const request = useRef<{ key: string; id: string } | null>(null);
  const trigger = api.topics.trigger.useMutation();
  const [error, setError] = useState<string | null>(null);
  async function submitProcess(values: TopicProcessInput) {
    setError(null);
    const key = JSON.stringify(values);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      const result = await trigger.mutateAsync({
        ...values,
        requestId: request.current.id,
      });
      request.current = null;
      return result.id;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not summarize traces.",
      );
      return null;
    }
  }
  function clearError() {
    if (!trigger.isPending) setError(null);
    regenerate.clearError();
  }
  return {
    available: facets.length > 0,
    clearError,
    dialogProps: {
      projectId,
      canWrite,
      generationTimeRange,
      onGenerationTimeRangeChange,
      settings,
      configurationError,
      regenerate,
      running,
      processError: error,
      processPending: trigger.isPending,
      submitProcess,
      onTriggered,
      onConfigure,
    },
  };
}

export type TopicProcessInput = {
  projectId: string;
  operation: "process";
  facets: TopicFacetRef[];
  reuseExistingSummaries: boolean;
} & (
  | { traceIds: string[] }
  | {
      selection: Extract<
        RouterInputs["topics"]["trigger"],
        { selection: unknown }
      >["selection"];
    }
);
