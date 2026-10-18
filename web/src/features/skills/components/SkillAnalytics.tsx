import { RefreshCw } from "lucide-react";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { StatusMessage } from "@/src/components/design-system/StatusMessage/StatusMessage";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { rangeToString, type TimeRange } from "@/src/utils/date-range-utils";
import { useSkillAnalytics } from "@/src/features/skills/hooks/useSkillAnalytics";
type SkillAnalyticsProps = {
  projectId: string;
  skillId: string;
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
        key={rangeToString(timeRange)}
        {...props}
        timeRange={timeRange}
      />
    </div>
  );
}

function SkillAnalyticsDashboard({
  projectId,
  skillId,
  paths,
  timeRange,
}: SkillAnalyticsProps & { timeRange: TimeRange }) {
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
  const fileTableData = prepareFileTableData(
    files.isPending,
    files.error,
    fileRows,
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
      <div className="flex flex-col gap-5 p-4">
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
        <section className="flex flex-col gap-3 rounded-lg border pt-4">
          <div className="flex flex-col gap-1 px-4">
            <h3 className="text-sm font-bold">File usage</h3>
          </div>
          <div className="ph-no-capture max-h-80 min-h-32 overflow-auto">
            <Table<FileUsage>
              tableName="Skill file usage"
              columns={[
                createTextTableColumn<FileUsage>({
                  accessorKey: "path",
                  header: "File",
                  size: 320,
                }),
                createNumberTableColumn<FileUsage>({
                  accessorKey: "loads",
                  header: "Loads",
                  size: 110,
                  formatter: formatCount,
                }),
              ]}
              data={fileTableData}
            />
          </div>
        </section>
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
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-2xl font-bold tabular-nums">{displayValue}</p>
      )}
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
