import { useMemo } from "react";
import { type QueryType } from "@langfuse/shared/query";
import { TimeRangePicker } from "@/src/components/date-picker";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { useReadPath } from "@/src/features/events";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { api } from "@/src/utils/api";
import {
  TABLE_AGGREGATION_OPTIONS,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";

type FileUsage = { file: string; loaded: number };

const COLUMNS = [
  createTextTableColumn<FileUsage>({
    accessorKey: "file",
    header: "File",
    size: 280,
  }),
  createNumberTableColumn<FileUsage>({
    accessorKey: "loaded",
    formatter: (value) => value.toLocaleString(),
    header: "Resource loads",
    size: 140,
  }),
];

export function SkillMetrics({
  projectId,
  skillName,
  filePaths,
}: {
  projectId: string;
  skillName: string;
  filePaths: string[];
}) {
  const { isV4, isResolved } = useReadPath();
  const version = isV4 ? "v2" : "v1";
  const { timeRange, setTimeRange } = useTableDateRange(projectId, {
    defaultRelativeAggregation: "last30Days",
  });
  const dateRange = useMemo(() => toAbsoluteTimeRange(timeRange), [timeRange]);
  const commonQuery: QueryType = {
    view: "observations",
    dimensions: [],
    metrics: [],
    filters: [
      {
        column: "skillName",
        type: "arrayOptions",
        operator: "any of",
        value: [skillName],
      },
    ],
    fromTimestamp: dateRange?.from.toISOString() ?? "",
    toTimestamp: dateRange?.to.toISOString() ?? "",
    timeDimension: null,
    orderBy: null,
  };
  const enabled = isResolved && Boolean(dateRange);
  const usage = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      version,
      query: {
        ...commonQuery,
        dimensions: [{ field: "skillName" }],
        metrics: [
          { measure: "skillAvailability", aggregation: "sum" },
          { measure: "skillLoads", aggregation: "sum" },
        ],
      },
    },
    { enabled },
  );
  const loads = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      version,
      query: {
        ...commonQuery,
        dimensions: [{ field: "loadedSkillResources" }],
        metrics: [{ measure: "skillResourceLoads", aggregation: "sum" }],
      },
    },
    { enabled },
  );
  const skillUsage = usage.data?.find((row) => row.skillName === skillName);
  const loadedByPath = new Map(
    (loads.data ?? []).flatMap((row) => {
      const [name, path] = JSON.parse(String(row.loadedSkillResources)) as [
        string,
        string,
      ];
      return name === skillName
        ? [[path, Number(row.sum_skillResourceLoads)] as const]
        : [];
    }),
  );
  const rows: FileUsage[] = [...new Set([...filePaths, ...loadedByPath.keys()])]
    .sort()
    .map((file) => ({ file, loaded: loadedByPath.get(file) ?? 0 }));
  const error = (usage.error ?? loads.error)?.message;
  const data = ((): AsyncTableData<FileUsage[]> => {
    if (error) return { status: "error", error };
    if (usage.isPending || loads.isPending) return { status: "loading" };
    return { status: "success", data: rows };
  })();

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Skill resource usage</h2>
          <p className="text-muted-foreground text-sm">
            Generation availability and resource loads across all versions.
          </p>
        </div>
        <TimeRangePicker
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          timeRangePresets={TABLE_AGGREGATION_OPTIONS}
        />
      </div>
      {dateRange ? (
        <>
          <div className="text-sm">
            Skill made available:{" "}
            <strong>
              {data.status === "success"
                ? Number(
                    skillUsage?.sum_skillAvailability ?? 0,
                  ).toLocaleString()
                : "—"}
            </strong>{" "}
            times
            {" · "}Resource loads:{" "}
            <strong>
              {data.status === "success"
                ? Number(skillUsage?.sum_skillLoads ?? 0).toLocaleString()
                : "—"}
            </strong>
          </div>
          <div className="ph-no-capture min-h-64 flex-1 rounded-md border">
            <Table
              tableName="Skill resource usage"
              columns={COLUMNS}
              data={data}
              loadingRowCount={3}
              noResultsMessage="No skill files found."
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Files include this version’s files and historical loads. Repeated
            reads count as additional loads.
          </p>
        </>
      ) : null}
    </section>
  );
}
