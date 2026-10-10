import { useMemo, useState } from "react";
import { type QueryType } from "@langfuse/shared/query";
import { TimeRangePicker } from "@/src/components/date-picker";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
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

type FileUsage = { file: string; available: number; loaded: number };

const COLUMNS = [
  createTextTableColumn<FileUsage>({
    accessorKey: "file",
    header: "File",
    size: 280,
  }),
  createNumberTableColumn<FileUsage>({
    accessorKey: "available",
    formatter: (value) => value.toLocaleString(),
    header: "Skill available",
    size: 140,
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
  const [selectedVersion, setSelectedVersion] = useState("all");
  const allVersions = selectedVersion === "all";
  const history = api.skills.skillVersions.useInfiniteQuery(
    { projectId, name: skillName, limit: 20 },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const selectedSkill = api.skills.byName.useQuery(
    {
      projectId,
      name: skillName,
      version: allVersions ? 1 : Number(selectedVersion),
    },
    { enabled: !allVersions },
  );
  const skillId = selectedSkill.data?.id;
  const { isV4, isResolved } = useReadPath();
  const metricsVersion = isV4 ? "v2" : "v1";
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
  const enabled =
    isResolved && Boolean(dateRange) && (allVersions || Boolean(skillId));
  const availability = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      version: metricsVersion,
      query: allVersions
        ? {
            ...commonQuery,
            dimensions: [{ field: "skillName" }],
            metrics: [{ measure: "skillAvailability", aggregation: "sum" }],
          }
        : {
            ...commonQuery,
            filters: [
              {
                column: "availableSkillIds",
                type: "arrayOptions",
                operator: "any of",
                value: [skillId ?? ""],
              },
            ],
            metrics: [{ measure: "count", aggregation: "count" }],
          },
    },
    { enabled },
  );
  const resourceDimension = allVersions
    ? "loadedSkillResources"
    : "loadedSkillResourceIds";
  const resourceMeasure = allVersions
    ? "skillResourceLoads"
    : "langfuseSkillResourceLoads";
  const loads = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      version: metricsVersion,
      query: {
        ...commonQuery,
        dimensions: [{ field: resourceDimension }],
        metrics: [{ measure: resourceMeasure, aggregation: "sum" }],
      },
    },
    { enabled },
  );
  const availableCount = Number(
    allVersions
      ? (availability.data?.find((row) => row.skillName === skillName)
          ?.sum_skillAvailability ?? 0)
      : (availability.data?.[0]?.count_count ?? 0),
  );
  const loadedByPath = new Map<string, number>();
  for (const row of loads.data ?? []) {
    const [identity, path] = JSON.parse(String(row[resourceDimension])) as [
      string,
      string,
    ];
    if (identity === (allVersions ? skillName : skillId)) {
      loadedByPath.set(
        path,
        (loadedByPath.get(path) ?? 0) + Number(row[`sum_${resourceMeasure}`]),
      );
    }
  }
  const paths = allVersions
    ? filePaths
    : (selectedSkill.data?.files.map((file) => file.path) ?? []);
  const rows: FileUsage[] = [...new Set([...paths, ...loadedByPath.keys()])]
    .sort()
    .map((file) => ({
      file,
      available: availableCount,
      loaded: loadedByPath.get(file) ?? 0,
    }));
  const totalLoads = [...loadedByPath.values()].reduce(
    (total, count) => total + count,
    0,
  );
  const error = (
    availability.error ??
    loads.error ??
    (!allVersions ? selectedSkill.error : null)
  )?.message;
  const data = ((): AsyncTableData<FileUsage[]> => {
    if (error) return { status: "error", error };
    if (availability.isPending || loads.isPending) return { status: "loading" };
    return { status: "success", data: rows };
  })();

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Skill resource usage</h2>
          <p className="text-muted-foreground text-sm">
            Generation availability and resource loads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <SelectInput
              aria-label="Skill version"
              value={selectedVersion}
              placeholder="Select version"
              options={[
                { value: "all", label: "All versions" },
                ...(
                  history.data?.pages.flatMap((page) => page.items) ?? []
                ).map(({ version }) => ({
                  value: String(version),
                  label: `Version ${version}`,
                })),
                ...(history.hasNextPage
                  ? [
                      {
                        value: "more",
                        label: "Load older versions…",
                        ...(history.isFetchingNextPage
                          ? {
                              disabled: true as const,
                              disabledReason: "Loading older versions",
                            }
                          : {}),
                      },
                    ]
                  : []),
              ]}
              onValueChange={async (value) => {
                if (value === "more") await history.fetchNextPage();
                else setSelectedVersion(value);
              }}
            />
          </div>
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={TABLE_AGGREGATION_OPTIONS}
          />
        </div>
      </div>
      {dateRange ? (
        <>
          <div className="text-sm">
            Skill made available:{" "}
            <strong>
              {data.status === "success"
                ? availableCount.toLocaleString()
                : "—"}
            </strong>{" "}
            times
            {" · "}Resource loads:{" "}
            <strong>
              {data.status === "success" ? totalLoads.toLocaleString() : "—"}
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
            Availability counts generations offering the skill, not individual
            files. Repeated reads count as additional loads.
            {allVersions
              ? " Files include this editor version’s files and historical loads. Loads without a Langfuse version are included in All versions."
              : " Only observations linked to this Langfuse skill version are included."}
          </p>
        </>
      ) : null}
    </section>
  );
}
