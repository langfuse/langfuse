import { useMemo } from "react";
import { useStore } from "zustand";

import type { useGatewayGuardrailsTableState } from "@/src/features/ai-gateway/hooks/useGatewayGuardrailsTableState";
import { api } from "@/src/utils/api";

const ALL_TAG = "all";

/**
 * Resolves the guardrails selected in the table for the chart filter: either
 * the individually checked rows or, under select-all, every guardrail matching
 * the table's search query. Subscribes directly to `selectionStore` so ticking
 * a row only re-renders the chart, not the page or table.
 */
export function useGatewayGuardrailSelection(
  organizationId: string,
  table: ReturnType<typeof useGatewayGuardrailsTableState>,
) {
  const rowSelection = useStore(table.selectionStore, (s) => s.rowSelection);
  const selectAll = useStore(table.selectionStore, (s) => s.selectAll);
  const rows = table.guardrails.data?.rows;
  const selectedRows = useMemo(
    () => (rows ?? []).filter((row) => rowSelection[row.id]),
    [rows, rowSelection],
  );

  const matching = api.aiGateway.guardrails.listMatching.useQuery(
    {
      orgId: organizationId,
      searchQuery: table.matching.searchQuery,
    },
    { enabled: selectAll },
  );

  const { refetch } = matching;
  const selection = useMemo((): GatewayGuardrailSelection => {
    if (!selectAll) {
      if (selectedRows.length === 0) return { status: "none" };
      return {
        status: "selected",
        querySelection: {
          type: "ids",
          ids: selectedRows.map((row) => row.id),
        },
        guardrails: selectedRows.map((row) => ({
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
      querySelection: table.matching,
      guardrails: matching.data.map(({ id, name }) => ({
        value: id,
        label: name,
      })),
    };
  }, [
    matching.data,
    matching.isError,
    refetch,
    table.matching,
    selectAll,
    selectedRows,
  ]);

  const tags = selectAll
    ? [
        {
          value: ALL_TAG,
          label: `All ${matching.data?.length ?? table.guardrails.data?.totalCount ?? 0} guardrails`,
        },
      ]
    : selectedRows.map((row) => ({
        value: row.id,
        label: row.name,
      }));

  const removeTag = (value: string) => {
    if (value === ALL_TAG) {
      table.clearSelection();
      return;
    }
    const row = selectedRows.find((candidate) => candidate.id === value);
    if (row) table.toggleRow(row.id);
  };

  return { selection, tags, removeTag };
}

export type GatewayGuardrailSelection =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | {
      status: "selected";
      querySelection:
        | { type: "ids"; ids: string[] }
        | { type: "matching"; searchQuery?: string };
      guardrails: { value: string; label: string }[];
    };
