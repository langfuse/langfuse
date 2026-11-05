import { useState } from "react";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { api } from "@/src/utils/api";
import { topicRuleFreshness, type TopicRuleMap } from "./topic-maps";

export type TopicRuleRow = TopicRuleMap & {
  facetNames: string[];
  freshness: string;
};

/** The project's rules as table rows, and the enable toggle that writes them. */
export function useTopicRules(projectId: string) {
  const [now] = useState(Date.now);
  const utils = api.useUtils();
  const maps = api.topics.maps.useQuery({ projectId });
  const facets = api.topics.facets.useQuery({ projectId });
  const setEnabled = api.topics.setRuleEnabled.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
  });
  const facetName = new Map(
    (facets.data ?? []).map((facet) => [facet.id, facet.name]),
  );
  const rows: TopicRuleRow[] | undefined = maps.data?.rules.map((rule) => ({
    ...rule,
    facetNames: rule.facetIds.map((id) => facetName.get(id) ?? "Facet"),
    freshness: topicRuleFreshness(rule, now),
  }));
  let tableData: AsyncTableData<TopicRuleRow[]> = { status: "loading" };
  if (maps.error) tableData = { status: "error", error: maps.error.message };
  else if (rows) tableData = { status: "success", data: rows };
  return {
    facets: facets.data ?? [],
    tableData,
    ruleCount: rows?.length ?? 0,
    pendingId: setEnabled.isPending ? (setEnabled.variables?.id ?? null) : null,
    toggleError: setEnabled.error?.message ?? null,
    setEnabled: (rule: TopicRuleRow, enabled: boolean) =>
      setEnabled.mutate({ projectId, id: rule.id, enabled }),
  };
}
