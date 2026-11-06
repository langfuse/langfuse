import { useState } from "react";
import { buildTracePath } from "@langfuse/shared";
import {
  type AgentDetailInput,
  type AgentRelationship,
} from "@langfuse/shared/agents";
import { api } from "@/src/utils/api";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Table } from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { agentCost, agentProfilePath } from "../hooks/agentsQuery";
import { AgentPagination } from "./AgentPagination";
import { AgentQueryError } from "./AgentQueryError";

export function AgentRelationshipsOverview({
  input,
}: {
  input: AgentDetailInput;
}) {
  const query = api.agents.relationships.useQuery(input);
  const scopeKey = JSON.stringify(input);
  const [pagination, setPagination] = useState({
    scopeKey,
    pageIndex: 0,
    pageSize: 20,
  });
  const page =
    pagination.scopeKey === scopeKey
      ? pagination
      : { scopeKey, pageIndex: 0, pageSize: 20 };
  const columns = [
    createLinkTableColumn<AgentRelationship>({
      id: "parent",
      header: "Calling agent",
      size: 220,
      accessorFn: (row) => row.parent.displayName,
      getCell: (name, { row }) => ({
        type: "link",
        props: {
          value: name ?? row.original.parent.identity.value,
          path: agentProfilePath(input, row.original.parent.identity),
        },
      }),
    }),
    createLinkTableColumn<AgentRelationship>({
      id: "child",
      header: "Called agent",
      size: 220,
      accessorFn: (row) => row.child.displayName,
      getCell: (name, { row }) => ({
        type: "link",
        props: {
          value: name ?? row.original.child.identity.value,
          path: agentProfilePath(input, row.original.child.identity),
        },
      }),
    }),
    createNumberTableColumn<AgentRelationship>({
      accessorKey: "runs",
      header: "Agent runs",
      size: 100,
      formatter: (value) => value.toLocaleString(),
    }),
    createNumberTableColumn<AgentRelationship>({
      accessorKey: "traces",
      header: "Traces",
      size: 100,
      formatter: (value) => value.toLocaleString(),
    }),
    createTableColumn<AgentRelationship, number>({
      accessorKey: "childOwnModelCost",
      header: "Called agent's model cost",
      size: 180,
      loadingCell: <Skeleton className="h-4 w-20 motion-reduce:animate-none" />,
      renderCell: (value, { row }) => (
        <CustomTooltip
          content={
            <p className="ph-no-capture max-w-xs">
              {row.original.pricedModelCalls.toLocaleString()} of{" "}
              {row.original.modelCalls.toLocaleString()} observed model calls
              have a known price. Unpriced calls are excluded from this cost.
            </p>
          }
        >
          {({ getTriggerProps }) => (
            <span {...getTriggerProps()} tabIndex={0} className="tabular-nums">
              {agentCost(value ?? null)}
            </span>
          )}
        </CustomTooltip>
      ),
      headerTooltip: {
        description:
          "Observed model cost owned by the called agent's runs. It excludes costs owned by other agents.",
      },
    }),
    createLinkTableColumn<AgentRelationship>({
      id: "example",
      header: "Example",
      size: 120,
      accessorFn: () => "Open trace",
      getCell: (value, { row }) => ({
        type: "link",
        props: {
          value: value ?? "Open trace",
          path: buildTracePath({
            projectId: input.projectId,
            traceId: row.original.example.traceId,
            observationId: row.original.example.observationId,
            timestamp: row.original.example.startTime,
          }),
        },
      }),
    }),
  ];
  const rows = query.data?.items ?? [];
  const pageIndex = Math.min(
    page.pageIndex,
    Math.max(0, Math.ceil(rows.length / page.pageSize) - 1),
  );
  const coverage = query.data?.coverage;
  return (
    <section className="ph-no-capture flex min-w-0 flex-col gap-3">
      <div>
        <h2 className="text-base font-bold">Observed relationships</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Calls between agents confirmed by recorded parent spans. Open an
          example to inspect the delegation in its trace.
        </p>
      </div>
      {query.isError ? (
        <AgentQueryError
          retry={() => {
            query.refetch();
          }}
        />
      ) : (
        <>
          <div className="overflow-auto rounded-lg border">
            <Table
              tableName="Observed agent relationships"
              columns={columns}
              data={
                query.isPending
                  ? { status: "loading" }
                  : {
                      status: "success",
                      data: rows.slice(
                        pageIndex * page.pageSize,
                        (pageIndex + 1) * page.pageSize,
                      ),
                    }
              }
              rowHeight="s"
              topBorder={false}
              noResultsMessage="No agent delegation could be verified in the inspected traces."
            />
          </div>
          {rows.length > page.pageSize && (
            <AgentPagination
              totalCount={rows.length}
              state={{ ...page, pageIndex }}
              onChange={(next) => setPagination({ ...next, scopeKey })}
            />
          )}
          {coverage && (
            <details className="text-muted-foreground text-xs">
              <summary className="w-fit cursor-pointer">
                Coverage: {coverage.traces.toLocaleString()} traces inspected
                {coverage.truncated ? " · bounded preview" : ""}
              </summary>
              <p className="mt-2">
                Inspected {coverage.spans.toLocaleString()} spans, up to{" "}
                {coverage.maxTraces.toLocaleString()} traces and{" "}
                {coverage.maxSpans.toLocaleString()} spans.{" "}
                {coverage.unresolvedRuns.toLocaleString()} agent runs have
                incomplete ancestry. Missing links are not inferred.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
