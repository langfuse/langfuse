import Link from "next/link";
import { buildTracePath, type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { numberFormatter } from "@/src/utils/numbers";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Table } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { Skeleton } from "@/src/components/ui/skeleton";

export function AgentSkills(input: {
  projectId: string;
  agentName: string;
  from: Date;
  to: Date;
  filter: FilterState;
}) {
  const query = api.agents.skillsFromEvents.useQuery(input, {
    trpc: { context: { skipBatch: true } },
  });
  type Skill = NonNullable<typeof query.data>["skills"][number];
  const columns = [
    createTextTableColumn<Skill>({
      accessorKey: "skillName",
      header: "Skill",
      size: 220,
      cellClassName: "ph-no-capture",
    }),
    createNumberTableColumn<Skill>({
      accessorKey: "invocations",
      header: "Invocations",
      size: 115,
      formatter: (value) => numberFormatter(value, 0),
    }),
    createNumberTableColumn<Skill>({
      accessorKey: "traces",
      header: "Traces",
      size: 100,
      formatter: (value) => numberFormatter(value, 0),
    }),
    createTableColumn<Skill, string[]>({
      accessorKey: "sampleTraceIds",
      header: "Sample traces",
      size: 200,
      loadingCell: <Skeleton className="h-4 w-24" />,
      renderCell: (traceIds) => (
        <div className="flex flex-wrap gap-2">
          {traceIds?.map((traceId, index) => (
            <Link
              key={traceId}
              href={buildTracePath({ projectId: input.projectId, traceId })}
              className="text-primary underline-offset-2 hover:underline"
              title={traceId}
            >
              Trace {index + 1}
            </Link>
          ))}
        </div>
      ),
    }),
    createDateTableColumn<Skill>({
      accessorKey: "lastUsed",
      header: "Last used",
      size: 175,
    }),
  ];
  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold">Observed skills</h2>
        <Badge color="yellow" text="Preview · tool-name matching" />
      </div>
      <p className="text-muted-foreground mt-2 text-sm">
        Matched from tool names such as skill_read and load_skill. Names come
        from span attributes or tool input, which may be truncated. This preview
        will use native skill tracking when available.
      </p>
      {query.isError && (
        <div className="mt-4">
          <Alert variant="destructive">
            <Alert.Title>Skills could not be loaded</Alert.Title>
            <Alert.Description>
              <Button
                text="Retry"
                variant="secondary"
                onClick={() => {
                  query.refetch();
                }}
              />
            </Alert.Description>
          </Alert>
        </div>
      )}
      {query.isPending && <Skeleton className="mt-4 h-28" />}
      {query.data?.skills.length === 0 && (
        <div className="text-muted-foreground mt-6 rounded-md border border-dashed p-6 text-sm">
          No matching skill tools in this window. Record named TOOL observations
          such as load_skill with a skill name in the input, and propagate this
          agent&apos;s name to them.
        </div>
      )}
      {query.data && query.data.skills.length > 0 && (
        <div className="mt-4">
          <Table
            tableName="Observed agent skills"
            columns={columns}
            data={{ status: "success", data: query.data.skills }}
            rowHeight="m"
          />
          {query.data.hasMore && (
            <p className="text-muted-foreground mt-2 text-xs">
              Showing the {query.data.limit} most frequently invoked skills in
              this window.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
