import { useMemo } from "react";

import type { useGatewayGuardrailsTableState } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/hooks/useGatewayGuardrailsTableState";
import { api } from "@/src/utils/api";

const ALL_TAG = "all";

/**
 * Resolves the guardrails selected in the table for the chart filter: either
 * the individually checked rows or, under select-all, every guardrail matching
 * the table's search query.
 */
export function useGatewayGuardrailSelection(
  organizationId: string,
  table: ReturnType<typeof useGatewayGuardrailsTableState>,
) {
  const matching = api.aiGateway.listMatchingGuardrails.useQuery(
    {
      orgId: organizationId,
      searchQuery: table.matching.searchQuery,
    },
    { enabled: table.selectAll },
  );

  const { refetch } = matching;
  const selection = useMemo((): GatewayGuardrailSelection => {
    if (!table.selectAll) {
      if (table.selectedRows.length === 0) return { status: "none" };
      return {
        status: "selected",
        guardrails: table.selectedRows.map((row) => ({
          value: row.id,
          label: row.name,
        })),
      };
    }
    if (matching.isError) {
      return {
        status: "error",
        onRetry: () => {
          refetch().catch(() => undefined);
        },
      };
    }
    if (!matching.data) return { status: "loading" };
    return {
      status: "selected",
      guardrails: matching.data.map(({ id, name }) => ({
        value: id,
        label: name,
      })),
    };
  }, [
    matching.data,
    matching.isError,
    refetch,
    table.selectAll,
    table.selectedRows,
  ]);

  const tags = table.selectAll
    ? [
        {
          value: ALL_TAG,
          label: `All ${matching.data?.length ?? table.guardrails.data?.totalCount ?? 0} guardrails`,
        },
      ]
    : table.selectedRows.map((row) => ({
        value: row.id,
        label: row.name,
      }));

  const removeTag = (value: string) => {
    if (value === ALL_TAG) {
      table.clearSelection();
      return;
    }
    const row = table.selectedRows.find((candidate) => candidate.id === value);
    if (row) table.toggleRow(row.id);
  };

  return { selection, tags, removeTag };
}

export type GatewayGuardrailSelection =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "selected"; guardrails: { value: string; label: string }[] };
