import { createContext, use, useState } from "react";
import { useRouter } from "next/router";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus } from "@langfuse/icons";
import { TOPICS_MAX_RULES } from "@langfuse/shared/topics";
import Page from "@/src/components/layouts/Page";
import { Spinner } from "@/src/components/layouts/Spinner";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { ErrorPage } from "@/src/components/error-page";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { useCanViewTopics } from "./topicsAccess";
import {
  samplingLabel,
  topicFilterChips,
  topicRuleFreshness,
  type TopicRuleMap,
} from "./topic-maps";
import { TopicSliceDialogController } from "./TopicSliceDialogController";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

type RuleRow = TopicRuleMap & { facetNames: string[]; freshness: string };

const RuleToggleContext = createContext<{
  canWrite: boolean;
  pendingId: string | null;
  onToggle: (rule: RuleRow, enabled: boolean) => void;
} | null>(null);

function RuleEnabledCell({ rule }: { rule: RuleRow }) {
  const context = use(RuleToggleContext);
  if (!context)
    throw new Error("RuleEnabledCell needs a RuleToggleContext provider.");
  return (
    <Switch
      aria-label={`${rule.enabled === false ? "Enable" : "Disable"} ${rule.name}`}
      checked={rule.enabled !== false}
      disabled={!context.canWrite || context.pendingId === rule.id}
      onCheckedChange={(checked) => context.onToggle(rule, checked)}
    />
  );
}

function FilterCell({ rule }: { rule: RuleRow }) {
  const chips = topicFilterChips(rule.filter);
  return (
    <span className="flex flex-wrap gap-1">
      {(chips.length ? chips : ["All traces"]).map((chip) => (
        <Badge key={chip} text={chip} size="sm" color="filled" />
      ))}
    </span>
  );
}

const columns: ColumnDef<RuleRow>[] = [
  { accessorKey: "name", header: "Name", size: 200 },
  {
    id: "enabled",
    header: "Enabled",
    size: 80,
    cell: ({ row }) => <RuleEnabledCell rule={row.original} />,
  },
  {
    id: "filter",
    header: "Filter",
    size: 280,
    cell: ({ row }) => <FilterCell rule={row.original} />,
  },
  {
    id: "sampling",
    header: "Sampling",
    size: 90,
    accessorFn: (row) => samplingLabel(row.sampling),
  },
  {
    id: "facets",
    header: "Facets",
    size: 200,
    accessorFn: (row) => row.facetNames.join(", "),
  },
  { accessorKey: "freshness", header: "Last updated", size: 220 },
];

export default function TopicRulesPage() {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string" ? router.query.projectId : "";
  const topicsEnabled = useCanViewTopics(projectId);
  if (!topicsEnabled)
    return (
      <ErrorPage title="Not found" message="This page is not available." />
    );
  return projectId ? (
    <TopicRules key={projectId} projectId={projectId} />
  ) : (
    <Page headerProps={{ title: "Topic rules" }}>
      <Spinner message="Loading rules" />
    </Page>
  );
}

function TopicRules({ projectId }: { projectId: string }) {
  const router = useRouter();
  const canWrite = useHasProjectAccess({ projectId, scope: "topics:CUD" });
  const [now] = useState(Date.now);
  const utils = api.useUtils();
  const maps = api.topics.maps.useQuery({ projectId });
  const facets = api.topics.facets.useQuery({ projectId });
  const setEnabled = api.topics.setRuleEnabled.useMutation({
    onSuccess: () => utils.topics.maps.invalidate({ projectId }),
  });
  const topicsHref = `/project/${projectId}/topics`;
  const facetName = new Map(
    (facets.data ?? []).map((facet) => [facet.id, facet.name]),
  );
  const rows: RuleRow[] = (maps.data?.rules ?? []).map((rule) => ({
    ...rule,
    facetNames: rule.facetIds.map((id) => facetName.get(id) ?? "Facet"),
    freshness: topicRuleFreshness(rule, now),
  }));
  const ruleCount = rows.length;
  return (
    <TopicSliceDialogController
      projectId={projectId}
      facets={facets.data ?? []}
      ruleCount={ruleCount}
      onAnalysisStarted={(analysisId) =>
        router.push(`${topicsHref}?map=analysis:${analysisId}`)
      }
    >
      {({ openSliceDialog }) => (
        <Page
          headerProps={{
            title: "Topic rules",
            breadcrumb: [{ name: "Topics", href: topicsHref }],
            actionButtonsRight: (
              <Button
                text="New rule"
                icon={Plus}
                disabled={!canWrite || ruleCount >= TOPICS_MAX_RULES}
                onClick={() => openSliceDialog({ kind: "rule", rule: null })}
              />
            ),
          }}
        >
          <RuleToggleContext
            value={{
              canWrite,
              pendingId: setEnabled.isPending
                ? (setEnabled.variables?.id ?? null)
                : null,
              onToggle: (rule, enabled) =>
                setEnabled.mutate({ projectId, id: rule.id, enabled }),
            }}
          >
            <div className="flex flex-col gap-6 overflow-y-auto p-3">
              <section className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  {ruleCount} of {TOPICS_MAX_RULES} rules. Each rule keeps a
                  live topic map for the traces it matches; rules may overlap.
                </p>
                <Table<RuleRow>
                  tableName="topicRules"
                  columns={columns}
                  data={ruleTableData(maps.error?.message, maps.data && rows)}
                  loadingRowCount={3}
                  noResultsMessage="No rules yet. Set up Topics to create the first rule."
                  getRowLabel={(row) => row.name}
                  onRowClick={(row) =>
                    router.push(`${topicsHref}?map=rule:${row.id}`)
                  }
                  actions={(row) => [
                    {
                      id: "open",
                      type: "item",
                      title: "Open map",
                      href: `${topicsHref}?map=rule:${row.id}`,
                    },
                    {
                      id: "edit",
                      type: "item",
                      title: "Edit rule",
                      disabled: canWrite
                        ? undefined
                        : { reason: "You need permission to edit Topics." },
                      onClick: () =>
                        openSliceDialog({ kind: "rule", rule: row }),
                    },
                  ]}
                />
                {setEnabled.error ? (
                  <TopicsErrorMessage message={setEnabled.error.message} />
                ) : null}
              </section>
            </div>
          </RuleToggleContext>
        </Page>
      )}
    </TopicSliceDialogController>
  );
}

function ruleTableData(
  error: string | undefined,
  rows: RuleRow[] | undefined,
): AsyncTableData<RuleRow[]> {
  if (error) return { status: "error", error };
  if (!rows) return { status: "loading" };
  return { status: "success", data: rows };
}
