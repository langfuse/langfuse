import { useState } from "react";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { SkillLinkedTraces } from "./SkillLinkedTraces";
import { Filter, RefreshCw } from "@langfuse/icons";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { StatusMessage } from "@/src/components/design-system/StatusMessage/StatusMessage";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TableHeaderControls } from "@/src/components/table/TableHeaderControls";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { rangeToString, type TimeRange } from "@/src/utils/date-range-utils";
import { useSkillAnalytics } from "@/src/features/skills/hooks/useSkillAnalytics";
type SkillAnalyticsProps = {
  projectId: string;
  skillId: string;
  name: string;
  version: number;
  paths: string[];
};
type FileUsage = {
  path: string;
  loads: number;
};

export function SkillAnalytics(props: SkillAnalyticsProps) {
  const { timeRange, setTimeRange } = useTableDateRange(props.projectId);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <TableHeaderControls timeRange={timeRange} setTimeRange={setTimeRange} />
      <SkillAnalyticsDashboard
        key={`${props.skillId}:${rangeToString(timeRange)}`}
        {...props}
        timeRange={timeRange}
      />
    </div>
  );
}

function SkillAnalyticsDashboard({
  projectId,
  skillId,
  name,
  version,
  paths,
  timeRange,
}: SkillAnalyticsProps & { timeRange: TimeRange }) {
  const [filePage, setFilePage] = useState(0);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { available, loaded, files, handleRefresh } = useSkillAnalytics({
    projectId,
    skillId,
    timeRange,
  });
  const fileMetrics = new Map(
    (files.data ?? []).map((file) => [String(file.loadedFilePaths), file]),
  );
  const fileRows = paths
    .map((path): FileUsage => {
      const file = fileMetrics.get(path);
      return {
        path,
        loads: Number(file?.count_count ?? 0),
      };
    })
    .toSorted((a, b) => b.loads - a.loads || a.path.localeCompare(b.path));
  const error = available.error ?? loaded.error ?? files.error;
  const pageIndex = Math.min(
    filePage,
    Math.max(0, Math.ceil(fileRows.length / 10) - 1),
  );
  const fileTableData = prepareFileTableData(
    files.isPending,
    files.error,
    fileRows.slice(pageIndex * 10, (pageIndex + 1) * 10),
  );
  return (
    <>
      <PageHeaderControlsPortal>
        <IconButton
          icon={RefreshCw}
          label="Refresh metrics"
          title="Refresh metrics"
          variant="outline"
          onClick={handleRefresh}
          disabled={
            available.isFetching || loaded.isFetching || files.isFetching
          }
        />
      </PageHeaderControlsPortal>
      <div className="flex flex-col gap-3 p-4">
        {error ? (
          <StatusMessage
            level="ERROR"
            size="compact"
            message={`Could not load some metrics: ${error.message}. Use Refresh metrics to retry.`}
          />
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric
            label="Available"
            value={
              available.data
                ? Number(available.data[0]?.count_count ?? 0)
                : null
            }
            loading={available.isPending}
            description="Observations offering this skill version"
          />
          <Metric
            label="Loaded"
            value={
              loaded.data ? Number(loaded.data[0]?.count_count ?? 0) : null
            }
            loading={loaded.isPending}
            description="Observations loading one or more files"
          />
        </div>
        <section className="flex flex-col gap-2 rounded-lg border pt-2">
          <div className="px-3">
            <h3 className="text-sm font-bold">File usage</h3>
          </div>
          <div className="ph-no-capture overflow-auto [&_tbody>tr]:h-8 [&_tbody>tr>td:not([colspan])]:py-1 [&_tbody>tr>td:not([colspan])>div]:h-6">
            <Table<FileUsage>
              tableName="Skill file usage"
              columns={[
                createTextTableColumn<FileUsage>({
                  accessorKey: "path",
                  header: "File",
                  size: 320,
                  trailingAction: {
                    type: "custom",
                    icon: Filter,
                    label: "Filter observations by this file",
                    onClick: ({ row }) => setSelectedFile(row.original.path),
                  },
                }),
                createNumberTableColumn<FileUsage>({
                  accessorKey: "loads",
                  header: "Loads",
                  size: 110,
                  formatter: formatCount,
                }),
              ]}
              data={fileTableData}
              onRowClick={(file) => setSelectedFile(file.path)}
              loadingRowCount={Math.min(paths.length, 10)}
            />
          </div>
          {fileRows.length > 10 ? (
            <PaginationBar
              mode="offset"
              totalCount={fileRows.length}
              state={{ pageIndex, pageSize: 10 }}
              pageSizeOptions={[10]}
              onChange={(state) => setFilePage(state.pageIndex)}
            />
          ) : null}
        </section>
        <SkillLinkedTraces
          projectId={projectId}
          name={name}
          version={version}
          timeRange={timeRange}
          fileFilter={
            selectedFile !== null
              ? {
                  skillId,
                  path: selectedFile,
                  onClear: () => setSelectedFile(null),
                }
              : undefined
          }
        />
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  description,
  loading,
}: {
  label: string;
  value: number | null;
  description: string;
  loading: boolean;
}) {
  const displayValue = value === null ? "—" : formatCount(value);
  return (
    <div className="flex flex-col gap-1 rounded-lg border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">{label}</p>
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          <p className="text-lg font-bold tabular-nums">{displayValue}</p>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

function prepareFileTableData(
  loading: boolean,
  error: { message: string } | null,
  rows: FileUsage[],
): AsyncTableData<FileUsage[]> {
  if (loading) return { status: "loading" };
  if (error) return { status: "error", error: error.message };
  return { status: "success", data: rows };
}

function formatCount(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
