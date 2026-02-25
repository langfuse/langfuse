import { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { type ExperimentsTableRow } from "../components/table/types";
import { api } from "@/src/utils/api";

type UseExperimentsTableDataParams = {
  projectId: string;
  filterState: FilterState;
  paginationState: {
    page: number;
    limit: number;
  };
  orderByState: {
    column: string;
    order: "ASC" | "DESC";
  } | null;
};

export function useExperimentsTableData({
  projectId,
  filterState,
  paginationState,
  orderByState,
}: UseExperimentsTableDataParams) {
  // Prepare query payloads
  const getCountPayload = useMemo(
    () => ({
      projectId,
      filter: filterState,
      page: 0,
      limit: 1,
      orderBy: null,
    }),
    [projectId, filterState],
  );

  const getAllPayload = useMemo(
    () => ({
      ...getCountPayload,
      page: paginationState.page - 1, // Backend uses 0-indexed pages
      limit: paginationState.limit,
      orderBy: orderByState,
    }),
    [
      getCountPayload,
      paginationState.page,
      paginationState.limit,
      orderByState,
    ],
  );

  // Fetch experiments
  const experimentsQuery = api.experiments.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
  });

  // Fetch total count
  const totalCountQuery = api.experiments.countAll.useQuery(getCountPayload, {
    refetchOnWindowFocus: true,
  });

  const totalCount = totalCountQuery.data?.count ?? null;

  // Transform backend data (snake_case) to frontend format (camelCase)
  const experiments = useMemo(() => {
    if (experimentsQuery.isLoading) {
      return { status: "loading" as const, rows: undefined };
    }

    if (experimentsQuery.isError) {
      return { status: "error" as const, rows: undefined };
    }

    const rows: ExperimentsTableRow[] =
      experimentsQuery.data?.data?.map((exp) => ({
        ...exp,
        scores: {}, // TODO: Add score aggregation when available
      })) ?? [];

    return { status: "success" as const, rows };
  }, [
    experimentsQuery.isLoading,
    experimentsQuery.isError,
    experimentsQuery.data,
  ]);

  const dataUpdatedAt = experimentsQuery.dataUpdatedAt;

  return {
    experiments,
    dataUpdatedAt,
    totalCount,
  };
}
