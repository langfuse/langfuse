import { api } from "@/src/utils/api";
import {
  type ExperimentEvalOptions,
  type ObservationEvalOptions,
} from "@langfuse/shared";
import { useMemo } from "react";

export function useEvalConfigFilterOptions({
  projectId,
}: {
  projectId: string;
}) {
  const traceFilterOptionsResponse = api.traces.filterOptions.useQuery(
    { projectId },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const environmentFilterOptionsResponse =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
      },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const observationsFilterOptionsResponse =
    api.generations.filterOptions.useQuery({
      projectId,
      observationType: "ALL",
    });

  const traceFilterOptions = useMemo(() => {
    // Normalize API response to match TraceOptions type (count should be number, not string)
    const normalized = traceFilterOptionsResponse.data
      ? {
          name: traceFilterOptionsResponse.data.name?.map((n) => ({
            value: n.value,
            count: Number(n.count),
          })),
          scores_avg: traceFilterOptionsResponse.data.scores_avg,
          score_categories: traceFilterOptionsResponse.data.score_categories,
          tags: traceFilterOptionsResponse.data.tags?.map((t) => ({
            value: t.value,
          })),
        }
      : {};

    return {
      ...normalized,
      environment: environmentFilterOptionsResponse.data?.map((e) => ({
        value: e.environment,
      })),
    };
  }, [traceFilterOptionsResponse.data, environmentFilterOptionsResponse.data]);

  const datasets = api.datasets.allDatasetMeta.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const datasetFilterOptions = useMemo(() => {
    if (!datasets.data) return undefined;
    return {
      datasetId: datasets.data?.map((d) => ({
        value: d.id,
        displayValue: d.name,
      })),
    };
  }, [datasets.data]);

  const observationEvalFilterOptions: ObservationEvalOptions = useMemo(() => {
    return {
      environment: environmentFilterOptionsResponse.data?.map((e) => ({
        value: e.environment,
      })),
      tags: traceFilterOptionsResponse.data?.tags?.map((t) => ({
        value: t.value,
      })),
      traceName: traceFilterOptionsResponse.data?.name?.map((n) => ({
        value: n.value,
      })),
      name: observationsFilterOptionsResponse.data?.name?.map((n) => ({
        value: n.value,
      })),
    };
  }, [
    traceFilterOptionsResponse.data,
    environmentFilterOptionsResponse.data,
    observationsFilterOptionsResponse.data,
  ]);

  const experimentEvalFilterOptions: ExperimentEvalOptions = useMemo(() => {
    return {
      experimentDatasetId: datasetFilterOptions?.datasetId,
    };
  }, [datasetFilterOptions]);

  return {
    traceFilterOptions,
    datasetFilterOptions,
    observationEvalFilterOptions,
    experimentEvalFilterOptions,
  };
}
