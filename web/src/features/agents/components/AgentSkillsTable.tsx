import { buildTracePath } from "@langfuse/shared";
import {
  type AgentDetailInput,
  type AgentSkillRow,
} from "@langfuse/shared/agents";
import { useRouter } from "next/router";
import { Table } from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Skeleton } from "@/src/components/ui/skeleton";
import { AgentPagination } from "./AgentPagination";
import { api } from "@/src/utils/api";
import { agentPage } from "../hooks/agentsQuery";
import { AgentQueryError } from "./AgentQueryError";

type SkillRow = AgentSkillRow & {
  managedSkill: { name: string; version: number } | null;
};

export function AgentSkillsTable({ input }: { input: AgentDetailInput }) {
  const router = useRouter();
  const page = agentPage(router.query.skillPage);
  const query = api.agents.skills.useQuery({ ...input, page, pageSize: 20 });
  const columns = [
    createTextTableColumn<SkillRow>({
      accessorKey: "name",
      header: "Observed skill",
      size: 220,
    }),
    createTextTableColumn<SkillRow>({
      accessorKey: "filePath",
      header: "File",
      size: 240,
      nullValue: "Not recorded",
    }),
    createTableColumn<SkillRow, string>({
      id: "managedVersion",
      accessorFn: (row) =>
        row.managedSkill
          ? `${row.managedSkill.name} · v${row.managedSkill.version}`
          : "Unresolved",
      header: "Managed version",
      size: 220,
      loadingCell: <Skeleton className="h-4 w-24" />,
      renderCell: (value, { row }) =>
        row.original.managedSkill ? (
          <TextLink
            value={value ?? "Open version"}
            path={`/project/${encodeURIComponent(input.projectId)}/skills/${encodeURIComponent(row.original.managedSkill.name)}?version=${row.original.managedSkill.version}`}
          />
        ) : (
          <span className="text-muted-foreground">Unresolved</span>
        ),
    }),
    createNumberTableColumn<SkillRow>({
      accessorKey: "loads",
      header: "Loads",
      size: 100,
    }),
    createNumberTableColumn<SkillRow>({
      accessorKey: "traces",
      header: "Traces",
      size: 100,
    }),
    createDateTableColumn<SkillRow>({
      accessorKey: "lastSeen",
      header: "Last observed",
      size: 190,
    }),
    createLinkTableColumn<SkillRow>({
      id: "evidence",
      accessorFn: (row) => row.sampleTraceIds[0],
      header: "Evidence",
      size: 150,
      getCell: (traceId) =>
        traceId
          ? {
              type: "link",
              props: {
                value: "Open trace",
                path: buildTracePath({
                  projectId: input.projectId,
                  traceId,
                }),
              },
            }
          : undefined,
    }),
  ];
  if (query.isError)
    return (
      <AgentQueryError
        retry={() => {
          query.refetch();
        }}
      />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="text-muted-foreground shrink-0 px-4 py-2 text-xs">
        Observed skill loads. Managed version links appear only when the exact
        project, skill ID and version are verified. Loads do not measure
        effectiveness.
      </p>
      <div className="flex min-h-48 flex-1 flex-col">
        <Table
          tableName="Agent skills"
          rowHeight="s"
          topBorder={false}
          columns={columns}
          data={
            query.isPending
              ? { status: "loading" }
              : { status: "success", data: query.data.items }
          }
          noResultsMessage="No skill loads were recorded for this agent in the selected period."
        />
      </div>
      <AgentPagination
        totalCount={query.data?.totalCount ?? null}
        state={{ pageIndex: page, pageSize: 20 }}
        onChange={(next) =>
          router.replace(
            {
              pathname: router.pathname,
              query: { ...router.query, skillPage: next.pageIndex + 1 },
            },
            undefined,
            { shallow: true },
          )
        }
      />
    </div>
  );
}
