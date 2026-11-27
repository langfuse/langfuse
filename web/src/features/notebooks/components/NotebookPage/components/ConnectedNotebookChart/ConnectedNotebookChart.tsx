import { type ComponentProps } from "react";

import { api } from "@/src/utils/api";
import { type RouterInput } from "@/src/utils/types";
import { NotebookChart } from "../NotebookChart/NotebookChart";

export function ConnectedNotebookChart({
  block,
  values,
  filters,
  ...snapshot
}: Pick<
  RouterInput["notebooks"]["chart"],
  "projectId" | "notebookId" | "documentId" | "version" | "staged" | "values"
> &
  Pick<ComponentProps<typeof NotebookChart>, "block" | "filters">) {
  const chart = api.notebooks.chart.useQuery(
    { ...snapshot, blockId: block.id, values },
    { refetchOnMount: "always", meta: { silentAllErrors: true } },
  );

  const state: ComponentProps<typeof NotebookChart>["state"] = (() => {
    if (chart.isSuccess) return { type: "ready", rows: chart.data.data };
    if (chart.isError) return { type: "error", onRetry: () => chart.refetch() };
    return { type: "loading" };
  })();

  return <NotebookChart block={block} state={state} filters={filters} />;
}
