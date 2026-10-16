import Link from "next/link";
import { buildTracePath, type AgentSessionProjection } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Table } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Skeleton } from "@/src/components/ui/skeleton";

const SOURCE_LABELS = {
  native: "Native references",
  mixed: "Native + tool matching",
  "tool-name-preview": "Tool-name matching",
};

export function AgentSkills({
  projectId,
  agentName,
  projection,
  onSelectSkill,
}: {
  projectId: string;
  agentName: string;
  projection: AgentSessionProjection;
  onSelectSkill: (name: string) => void;
}) {
  const canReadDefinitions = useHasProjectAccess({
    projectId,
    scope: "skills:read",
  });
  const definitions = api.skills.all.useQuery(
    { projectId, page: 1, limit: 100 },
    { enabled: canReadDefinitions, refetchOnWindowFocus: false },
  );
  const managedNames = new Set(
    definitions.data?.data.map((skill) => skill.name) ?? [],
  );
  const skills = projection.skills.filter(
    (skill) => skill.agentName === agentName && skill.invocations > 0,
  );
  type Skill = (typeof skills)[number];
  const columns = [
    createTextTableColumn<Skill>({
      accessorKey: "name",
      header: "Skill",
      size: 220,
      cellClassName: "ph-no-capture",
    }),
    createTableColumn<Skill, string>({
      accessorFn: (row) => row.name,
      id: "definition",
      header: "Definition",
      size: 180,
      loadingCell: <Skeleton className="h-4 w-24" />,
      renderCell: (name) =>
        name && managedNames.has(name) ? (
          <Link
            className="text-primary ph-no-capture underline-offset-2 hover:underline"
            href={`/project/${projectId}/skills/${encodeURIComponent(name)}`}
          >
            Managed definition
          </Link>
        ) : (
          <span className="text-muted-foreground">Observed name</span>
        ),
    }),
    createTableColumn<Skill, Skill["source"]>({
      accessorKey: "source",
      header: "Evidence",
      size: 180,
      loadingCell: <Skeleton className="h-4 w-24" />,
      renderCell: (source) => (
        <Badge
          text={source ? SOURCE_LABELS[source] : "Unknown"}
          color={source === "native" ? "filled" : "yellow"}
        />
      ),
    }),
    createNumberTableColumn<Skill>({
      accessorKey: "invocations",
      header: "Loads",
      size: 95,
    }),
    createNumberTableColumn<Skill>({
      accessorKey: "sessions",
      header: "Sessions",
      size: 100,
    }),
    createNumberTableColumn<Skill>({
      accessorKey: "traces",
      header: "Traces",
      size: 100,
    }),
    createDateTableColumn<Skill>({
      accessorKey: "lastUsed",
      header: "Last loaded",
      size: 170,
    }),
    createTableColumn<Skill, string[]>({
      accessorKey: "sampleTraceIds",
      header: "Supporting traces",
      size: 200,
      loadingCell: <Skeleton className="h-4 w-24" />,
      renderCell: (traceIds) => (
        <div className="flex flex-wrap gap-2">
          {traceIds?.map((traceId, index) => (
            <Link
              key={traceId}
              href={buildTracePath({ projectId, traceId })}
              className="text-primary ph-no-capture underline-offset-2 hover:underline"
              title={traceId}
            >
              Trace {index + 1}
            </Link>
          ))}
        </div>
      ),
    }),
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <div className="shrink-0">
        <h2 className="text-sm font-bold">Observed skills</h2>
        <p className="text-muted-foreground mt-2 text-xs">
          Select a skill to inspect sessions with observed loads.
        </p>
      </div>
      {skills.length === 0 && (
        <div className="text-muted-foreground shrink-0 rounded-md border border-dashed p-6 text-sm">
          No skill loads were observed in this window. Record native skill
          references or attributed skill-loading TOOL observations.
        </div>
      )}
      {skills.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <Table
            tableName="Observed agent skills"
            columns={columns}
            data={{ status: "success", data: skills }}
            rowHeight="s"
            onRowClick={(row) => onSelectSkill(row.name)}
          />
        </div>
      )}
      {projection.coverage.groupsTruncated && (
        <p className="text-muted-foreground shrink-0 text-xs">
          Showing up to {projection.coverage.groupsLimit} skill groups per
          agent.
        </p>
      )}
      {canReadDefinitions && definitions.isError && (
        <p className="text-muted-foreground shrink-0 text-xs">
          Catalog definitions are unavailable. Observed usage remains available.
        </p>
      )}
      {canReadDefinitions &&
        definitions.data &&
        definitions.data.meta.totalItems > 100 && (
          <p className="text-muted-foreground shrink-0 text-xs">
            Definition links match the first 100 catalog names. Other names
            remain unresolved.
          </p>
        )}
    </div>
  );
}
