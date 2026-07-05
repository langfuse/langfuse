import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import type {
  DiagnosticArea,
  DiagnosticStatus,
  InstanceHealthFinding,
  InstanceHealthLedgerRow,
  InstanceHealthResponse,
  InstanceHealthTimeRange,
} from "@/src/features/instance-health/types";
import { INSTANCE_HEALTH_TIME_RANGES } from "@/src/features/instance-health/types";
import {
  prepareInstanceHealthView,
  type PreparedClickHouseMetricPanel,
  type PreparedOperatorMetric,
} from "@/src/features/instance-health/lib/prepareInstanceHealthView";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  RefreshCw,
  Server,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";

const STATUS_LABELS: Record<DiagnosticStatus, string> = {
  ok: "OK",
  warning: "Warning",
  error: "Error",
  unavailable: "Unavailable",
};

const AREA_LABELS: Record<DiagnosticArea, string> = {
  web: "Web",
  postgres: "Postgres",
  redis: "Redis",
  queues: "Queues",
  worker: "Worker",
  clickhouse: "ClickHouse",
  capacity: "Capacity",
};

const STATUS_ICON = {
  ok: CheckCircle2,
  warning: TriangleAlert,
  error: XCircle,
  unavailable: AlertCircle,
} satisfies Record<DiagnosticStatus, typeof CheckCircle2>;

const TIME_RANGE_LABELS: Record<InstanceHealthTimeRange, string> = {
  now: "Now",
  "1h": "1h",
  "6h": "6h",
  "24h": "24h",
};

const statusTone = (status: DiagnosticStatus) =>
  ({
    ok: "border-dark-green/20 bg-light-green text-dark-green",
    warning: "border-dark-yellow/30 bg-light-yellow text-dark-yellow",
    error: "border-dark-red/20 bg-light-red text-dark-red",
    unavailable: "border-border bg-muted text-muted-foreground",
  })[status];

const statusDotTone = (status: DiagnosticStatus) =>
  ({
    ok: "bg-dark-green",
    warning: "bg-dark-yellow",
    error: "bg-dark-red",
    unavailable: "bg-muted-foreground",
  })[status];

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));

const StatusBadge = ({ status }: { status: DiagnosticStatus }) => {
  const Icon = STATUS_ICON[status];

  return (
    <Badge
      variant="outline-solid"
      size="sm"
      className={cn(
        "w-fit gap-1 self-start whitespace-nowrap",
        statusTone(status),
      )}
    >
      <Icon className="h-3 w-3" />
      {STATUS_LABELS[status]}
    </Badge>
  );
};

const HeaderSummary = ({
  data,
  isFetching,
  onRefresh,
}: {
  data: InstanceHealthResponse;
  isFetching: boolean;
  onRefresh: () => void;
}) => {
  const availableCount = data.ledgerRows.filter(
    (row) => row.status !== "unavailable",
  ).length;
  const totalCount = data.ledgerRows.length;

  return (
    <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={data.overallStatus} />
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <Clock3 className="h-3 w-3" />
          {formatTimestamp(data.generatedAt)}
        </div>
        <div className="text-muted-foreground text-xs">
          {availableCount}/{totalCount} diagnostics available
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        loading={isFetching}
        aria-label="Refresh diagnostics"
      >
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
};

const Sparkline = ({ metric }: { metric: PreparedOperatorMetric }) => {
  const series = metric.series?.find((row) => row.points.length > 1);
  if (!series) return null;

  const width = 160;
  const height = 36;
  const points = series.points
    .map((point, index) => {
      const x = (index / (series.points.length - 1)) * width;
      const y =
        height -
        3 -
        (point.normalizedValue === null ? 0 : point.normalizedValue) *
          (height - 6);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="bg-muted/10 mt-3 h-10 w-full border"
      role="img"
      aria-label={`${metric.title} trend`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={cn(
          metric.status === "ok" && "text-dark-green",
          metric.status === "warning" && "text-dark-yellow",
          metric.status === "error" && "text-dark-red",
          metric.status === "unavailable" && "text-muted-foreground",
        )}
      />
    </svg>
  );
};

const OperatorMetricsPanel = ({
  metrics,
}: {
  metrics: PreparedOperatorMetric[];
}) => (
  <section className="min-w-0">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">Operator Metrics</h2>
      <span className="text-muted-foreground text-xs">
        Current values and bounded history
      </span>
    </div>
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.id} className="min-w-0 border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    statusDotTone(metric.status),
                  )}
                />
                <span className="truncate" title={AREA_LABELS[metric.area]}>
                  {AREA_LABELS[metric.area]}
                </span>
              </div>
              <div
                className="mt-1 text-sm leading-5 font-medium break-words"
                title={metric.title}
              >
                {metric.title}
              </div>
            </div>
            <StatusBadge status={metric.status} />
          </div>
          <div className="mt-3 font-mono text-2xl leading-none">
            {metric.value}
          </div>
          <div className="text-muted-foreground mt-2 min-h-8 text-xs">
            {metric.detail}
          </div>
          <Sparkline metric={metric} />
        </div>
      ))}
    </div>
  </section>
);

const FixFirstPanel = ({ findings }: { findings: InstanceHealthFinding[] }) => (
  <section className="min-w-0 border">
    <div className="flex items-center justify-between border-b px-3 py-2">
      <h2 className="text-sm font-semibold">Fix First</h2>
      <span className="text-muted-foreground text-xs">
        {findings.length ? `${findings.length} ranked` : "clear"}
      </span>
    </div>
    {findings.length === 0 ? (
      <div className="text-muted-foreground px-3 py-4 text-sm">
        No immediate operator action detected.
      </div>
    ) : (
      <div className="divide-y">
        {findings.map((finding, index) => (
          <div
            key={finding.id}
            className="grid gap-2 px-3 py-3 md:grid-cols-[32px_140px_1fr]"
          >
            <div className="text-muted-foreground font-mono text-xs">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="flex items-start gap-2">
              <StatusBadge status={finding.status} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="text-sm font-medium">{finding.title}</div>
                <span className="text-muted-foreground font-mono text-xs">
                  {AREA_LABELS[finding.area]}
                </span>
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                {finding.evidence}
              </div>
              <div className="mt-2 text-xs">{finding.nextAction}</div>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);

const TopologyStrip = ({
  data,
  selectedArea,
  onSelectArea,
}: {
  data: InstanceHealthResponse;
  selectedArea: DiagnosticArea | "all";
  onSelectArea: (area: DiagnosticArea | "all") => void;
}) => {
  const nodesById = new Map(data.topologyNodes.map((node) => [node.id, node]));
  const mainNodeIds = ["web", "redis", "queues", "worker", "clickhouse"];
  const postgresNode = nodesById.get("postgres");

  return (
    <section className="min-w-0 border px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {mainNodeIds.map((nodeId, index) => {
          const node = nodesById.get(nodeId);
          if (!node) return null;
          return (
            <div key={node.id} className="flex items-center gap-2">
              <button
                className={cn(
                  "hover:bg-muted flex min-h-9 items-center gap-2 border px-2 py-1 text-left text-xs transition-colors",
                  selectedArea === node.area && "border-primary bg-muted",
                )}
                onClick={() => onSelectArea(node.area)}
                type="button"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    statusDotTone(node.status),
                  )}
                />
                <span className="font-medium">{node.label}</span>
                <span
                  className="text-muted-foreground max-w-36 truncate"
                  title={node.summary}
                >
                  {node.summary}
                </span>
              </button>
              {index < mainNodeIds.length - 1 ? (
                <ChevronRight className="text-muted-foreground h-4 w-4" />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
        <Server className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground text-xs">Dependency branch</span>
        {postgresNode ? (
          <button
            className={cn(
              "hover:bg-muted flex min-h-8 items-center gap-2 border px-2 py-1 text-xs",
              selectedArea === "postgres" && "border-primary bg-muted",
            )}
            onClick={() => onSelectArea("postgres")}
            type="button"
          >
            <StatusBadge status={postgresNode.status} />
            Postgres
          </button>
        ) : null}
        {selectedArea !== "all" ? (
          <Button variant="ghost" size="sm" onClick={() => onSelectArea("all")}>
            Clear
          </Button>
        ) : null}
      </div>
    </section>
  );
};

const RunbookSteps = ({ data }: { data: InstanceHealthResponse }) => (
  <section className="min-w-0 border">
    <div className="border-b px-3 py-2">
      <h2 className="text-sm font-semibold">Triage Runbook</h2>
    </div>
    <div className="divide-y">
      {data.runbookSteps.map((step) => (
        <div
          key={step.id}
          className="grid gap-2 px-3 py-3 md:grid-cols-[36px_120px_1fr]"
        >
          <div className="text-muted-foreground font-mono text-xs">
            {String(step.order).padStart(2, "0")}
          </div>
          <StatusBadge status={step.status} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{step.title}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {AREA_LABELS[step.area]}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 grid gap-1 text-xs md:grid-cols-2">
              <span>{step.signal}</span>
              <span>{step.expected}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const DiagnosticsLedger = ({
  rows,
  areaOptions,
  statusOptions,
  areaFilter,
  statusFilter,
  onAreaFilterChange,
  onStatusFilterChange,
}: {
  rows: InstanceHealthLedgerRow[];
  areaOptions: DiagnosticArea[];
  statusOptions: DiagnosticStatus[];
  areaFilter: DiagnosticArea | "all";
  statusFilter: DiagnosticStatus | "all";
  onAreaFilterChange: (area: DiagnosticArea | "all") => void;
  onStatusFilterChange: (status: DiagnosticStatus | "all") => void;
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="min-w-0 border">
      <div className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-semibold">Ops Ledger</h2>
        <div className="flex flex-wrap gap-2">
          <Select
            value={areaFilter}
            onValueChange={(value) =>
              onAreaFilterChange(value as DiagnosticArea | "all")
            }
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areaOptions.map((area) => (
                <SelectItem key={area} value={area}>
                  {AREA_LABELS[area]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatusFilterChange(value as DiagnosticStatus | "all")
            }
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="w-28">Area</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-44">Signal</TableHead>
              <TableHead className="w-52">Current value</TableHead>
              <TableHead className="w-64">Expected</TableHead>
              <TableHead className="w-40">Last checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground h-14 text-center text-xs"
                >
                  No diagnostics match the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedRows.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow key={row.id}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => toggleExpanded(row.id)}
                          aria-label={
                            isExpanded
                              ? "Collapse diagnostic row"
                              : "Expand diagnostic row"
                          }
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {AREA_LABELS[row.area]}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-xs break-words">
                        {row.signal}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.currentValue}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs break-words">
                        {row.expected}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {formatTimestamp(row.lastChecked)}
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow key={`${row.id}-details`}>
                        <TableCell
                          colSpan={7}
                          className="bg-muted/30 px-3 py-3"
                        >
                          {row.details?.length ? (
                            <div className="grid gap-2 md:grid-cols-2">
                              {row.details.map((detail) => (
                                <div
                                  key={`${row.id}-${detail.label}-${detail.value}`}
                                  className="bg-background flex min-h-8 items-center justify-between gap-3 border px-2 py-1 text-xs"
                                >
                                  <span className="text-muted-foreground">
                                    {detail.label}
                                  </span>
                                  <span className="text-right font-mono">
                                    {detail.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              No additional details.
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
};

const HistoryStrip = ({ panel }: { panel: PreparedClickHouseMetricPanel }) => {
  if (!panel.hasHistory) {
    return (
      <div className="bg-muted/20 text-muted-foreground flex h-20 items-center justify-center border px-3 text-center text-xs">
        {panel.history.emptyState ?? "No history available"}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2">
      {panel.preparedSeries.slice(0, 4).map((series) => {
        const width = 100;
        const height = 28;
        const points = series.points
          .map((point, index) => {
            const x =
              series.points.length <= 1
                ? width
                : (index / (series.points.length - 1)) * width;
            const y =
              height -
              2 -
              (point.normalizedValue === null ? 0 : point.normalizedValue) *
                (height - 4);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(" ");

        return (
          <div
            key={series.id}
            className="grid min-w-0 grid-cols-[minmax(90px,140px)_1fr] items-center gap-2"
          >
            <div
              className="text-muted-foreground truncate font-mono text-[11px]"
              title={`${series.node} / ${series.label}`}
            >
              {series.node} / {series.label}
            </div>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="bg-background h-8 w-full min-w-0 border"
              role="img"
              aria-label={`${series.label} history`}
            >
              <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="text-primary"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
};

const ClickHouseHealthPanel = ({
  panels,
}: {
  panels: ReturnType<typeof prepareInstanceHealthView>["clickhousePanels"];
}) => (
  <section className="min-w-0 border">
    <div className="border-b px-3 py-2">
      <h2 className="text-sm font-semibold">ClickHouse Health</h2>
    </div>
    <div className="grid min-w-0 gap-3 p-3">
      <div className="grid min-w-0 gap-2 md:grid-cols-3">
        {panels.summary.map((item) => (
          <div key={item.label} className="min-w-0 border px-3 py-2">
            <div className="text-muted-foreground text-xs">{item.label}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{item.value}</span>
              {item.status ? <StatusBadge status={item.status} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-3">
        {panels.metrics.map((panel) => (
          <div key={panel.id} className="min-w-0 border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="text-sm font-medium">{panel.title}</h3>
              <StatusBadge status={panel.status} />
            </div>
            <div className="grid gap-3 p-3">
              <div className="grid gap-1">
                {panel.current.length ? (
                  panel.current.slice(0, 6).map((detail) => (
                    <div
                      key={`${panel.id}-${detail.label}`}
                      className="flex min-w-0 items-center justify-between gap-3 text-xs"
                    >
                      <span
                        className="text-muted-foreground truncate"
                        title={detail.label}
                      >
                        {detail.label}
                      </span>
                      <span className="shrink-0 font-mono">{detail.value}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground text-xs">
                    Current value unavailable.
                  </div>
                )}
              </div>
              <HistoryStrip panel={panel} />
            </div>
          </div>
        ))}
      </div>
      <div className="min-w-0 border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-medium">Table Sizes</h3>
          <StatusBadge status={panels.tables.status} />
        </div>
        {panels.tables.rows.length ? (
          <div className="max-h-80 w-full max-w-full overflow-auto overscroll-x-contain">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Node</TableHead>
                  <TableHead className="w-64">Table</TableHead>
                  <TableHead className="w-44">Engine</TableHead>
                  <TableHead className="w-24">Rows</TableHead>
                  <TableHead className="w-24">Bytes</TableHead>
                  <TableHead className="w-20">Parts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {panels.tables.rows.map((row) => (
                  <TableRow key={`${row.node}-${row.database}-${row.table}`}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.node}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.database}.{row.table}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {row.engine}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.rows}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.bytes}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.parts}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-muted-foreground px-3 py-6 text-sm">
            {panels.tables.emptyState ?? "Table metadata unavailable."}
          </div>
        )}
      </div>
    </div>
  </section>
);

const LoadingPanel = () => (
  <div className="grid gap-3">
    <div className="bg-muted/40 h-12 animate-pulse border" />
    <div className="bg-muted/40 h-40 animate-pulse border" />
    <div className="bg-muted/40 h-64 animate-pulse border" />
  </div>
);

export const InstanceHealthSettingsPage = ({ orgId }: { orgId: string }) => {
  const [timeRange, setTimeRange] = useState<InstanceHealthTimeRange>("1h");
  const [areaFilter, setAreaFilter] = useState<DiagnosticArea | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DiagnosticStatus | "all">(
    "all",
  );

  const query = api.instanceHealth.get.useQuery(
    { orgId, timeRange },
    {
      enabled: Boolean(orgId),
      refetchOnWindowFocus: false,
    },
  );

  const prepared = useMemo(
    () =>
      query.data
        ? prepareInstanceHealthView(query.data, {
            area: areaFilter,
            status: statusFilter,
          })
        : null,
    [areaFilter, query.data, statusFilter],
  );

  if (query.isLoading && !prepared) return <LoadingPanel />;

  if (query.error) {
    return (
      <section className="border px-3 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <XCircle className="text-dark-red h-4 w-4" />
          Instance health diagnostics unavailable
        </div>
        <div className="text-muted-foreground mt-2 text-sm">
          {query.error.message}
        </div>
      </section>
    );
  }

  if (!prepared) return null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <HeaderSummary
        data={prepared}
        isFetching={query.isFetching}
        onRefresh={() => {
          query.refetch().catch(() => undefined);
        }}
      />
      <div className="flex flex-col gap-2 border-b pb-4 md:flex-row md:items-center md:justify-between">
        <div className="text-sm font-medium">Time range</div>
        <ToggleGroup
          type="single"
          value={timeRange}
          onValueChange={(value) => {
            if (value) setTimeRange(value as InstanceHealthTimeRange);
          }}
          variant="outline"
          size="xs"
          className="justify-start"
        >
          {INSTANCE_HEALTH_TIME_RANGES.map((range) => (
            <ToggleGroupItem key={range} value={range} className="min-w-12">
              {TIME_RANGE_LABELS[range]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <OperatorMetricsPanel metrics={prepared.operatorMetrics} />
      <ClickHouseHealthPanel panels={prepared.clickhousePanels} />
      {prepared.findings.length ? (
        <FixFirstPanel findings={prepared.findings} />
      ) : null}
      <TopologyStrip
        data={prepared}
        selectedArea={areaFilter}
        onSelectArea={setAreaFilter}
      />
      <DiagnosticsLedger
        rows={prepared.ledgerRows}
        areaOptions={prepared.areaOptions}
        statusOptions={prepared.statusOptions}
        areaFilter={areaFilter}
        statusFilter={statusFilter}
        onAreaFilterChange={setAreaFilter}
        onStatusFilterChange={setStatusFilter}
      />
      <RunbookSteps data={prepared} />
    </div>
  );
};
