import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Database } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import {
  getPromptStageHref,
  getTreeIcon,
  getWorkspacePreviewNodes,
  getWorkspaceSelectionLabel,
  humanizeSegment,
} from "../shell/product-manifest";

type MetricTone = "good" | "bad" | "neutral";
type MetricDirection = "up" | "down" | "flat";

type FolderOverviewMetric = {
  label: string;
  value: string;
  description: string;
  direction: MetricDirection;
  tone: MetricTone;
  series: number[];
};

type FolderOverviewDataset = {
  id: string;
  label: string;
  status: string;
};

type FolderOverviewContent = {
  rangeLabel: string;
  timeWindowLabel: string;
  metrics: FolderOverviewMetric[];
  datasets: FolderOverviewDataset[];
};

type AssetRow = {
  id: string;
  label: string;
  kind: "Prompt" | "Dataset";
  status: string;
  href?: string;
  icon: ReactNode;
};

const CHART_LABELS = [
  "13:00",
  "15:00",
  "17:00",
  "19:00",
  "21:00",
  "23:00",
  "01:00",
  "03:00",
  "05:00",
  "07:00",
  "09:00",
  "12:00",
] as const;

const DEFAULT_FOLDER_OVERVIEW: FolderOverviewContent = {
  rangeLabel: "24 hrs",
  timeWindowLabel: "Between Oct 13 12:28 and Oct 14 12:28",
  metrics: [
    {
      label: "Logs",
      value: "73",
      description:
        "Prompt executions captured in this folder during the selected window.",
      direction: "up",
      tone: "good",
      series: [7, 5, 13, 8, 17, 6, 11, 12, 14, 6, 0, 0],
    },
    {
      label: "Avg latency",
      value: "5.27s",
      description:
        "Average end-to-end latency across the most recent prompt runs.",
      direction: "up",
      tone: "bad",
      series: [12, 8, 11, 6, 8, 5, 13, 10, 9, 12, 11, 0],
    },
    {
      label: "Avg cost",
      value: "$0.0011",
      description:
        "Blended unit cost for the executions in this workspace slice.",
      direction: "up",
      tone: "bad",
      series: [2, 2, 2, 2, 6, 2, 2, 2, 2, 4, 0, 0],
    },
    {
      label: "Avg input tokens",
      value: "0",
      description: "Input token usage trend across the last 24 hours.",
      direction: "up",
      tone: "good",
      series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "Avg output tokens",
      value: "0",
      description: "Output token usage trend across the last 24 hours.",
      direction: "up",
      tone: "good",
      series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "Avg eval score",
      value: "0.72",
      description:
        "Most recent evaluator score trend for prompts in this folder.",
      direction: "down",
      tone: "bad",
      series: [1, 12, 12, 3, 12, 4, 12, 12, 12, 3, 0, 0],
    },
  ],
  datasets: [
    {
      id: "issue-intake-samples",
      label: "Issue intake samples",
      status: "Ready",
    },
    {
      id: "resolution-quality-set",
      label: "Resolution quality set",
      status: "Ready",
    },
  ],
};

type WorkspaceFolderOverviewProps = {
  projectId: string;
  folderPath: string[];
};

export function WorkspaceFolderOverview({
  projectId,
  folderPath,
}: WorkspaceFolderOverviewProps) {
  const content = getFolderOverviewContent(folderPath);
  const folderLabel = getWorkspaceSelectionLabel(folderPath);
  const promptRows = getPromptRows(projectId, folderPath);
  const datasetRows = content.datasets.map<AssetRow>((dataset) => ({
    id: dataset.id,
    label: dataset.label,
    kind: "Dataset",
    status: dataset.status,
    icon: <Database className="text-muted-foreground size-4" />,
  }));

  return (
    <div className="bg-muted/20 flex min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline-solid">Workspace</Badge>
              <Badge variant="outline-solid">{content.rangeLabel}</Badge>
            </div>
            <Header title={`${folderLabel} Overview`} className="mb-0" />
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              {content.timeWindowLabel}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {content.metrics.map((metric) => (
              <SummaryMetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4 lg:grid-cols-2">
            {content.metrics.map((metric) => (
              <MetricChartCard key={metric.label} metric={metric} />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <AssetCard
              title="Recent Prompts"
              description="Prompt assets in this workspace folder."
              rows={promptRows}
            />
            <AssetCard
              title="Recent Datasets"
              description="Evaluation datasets associated with this folder."
              rows={datasetRows}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryMetricCard({ metric }: { metric: FolderOverviewMetric }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {metric.label}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {metric.value}
          </span>
          <MetricTrendBadge direction={metric.direction} tone={metric.tone} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricChartCard({ metric }: { metric: FolderOverviewMetric }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{metric.label}</CardTitle>
            <CardDescription className="mt-1">
              {metric.description}
            </CardDescription>
          </div>
          <MetricTrendBadge direction={metric.direction} tone={metric.tone} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <TotalMetric
          metric={<span className="tabular-nums">{metric.value}</span>}
          description="vs previous window"
          className="items-center"
        />
        <div className="h-52">
          <MetricAreaChart metric={metric} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricAreaChart({ metric }: { metric: FolderOverviewMetric }) {
  const data = metric.series.map((value, index) => ({
    bucket: CHART_LABELS[index] ?? String(index),
    value,
  }));
  const config = {
    value: {
      label: metric.label,
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="h-full w-full">
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ left: -20, right: 8 }}
      >
        <CartesianGrid vertical={false} stroke="hsl(var(--chart-grid))" />
        <XAxis
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis hide domain={[0, "dataMax + 2"]} />
        <ChartTooltip
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload}
              label={label}
              indicator="line"
              valueFormatter={(value) =>
                formatMetricTooltipValue(metric.label, Number(value))
              }
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          fill="var(--color-value)"
          fillOpacity={0.18}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function AssetCard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: AssetRow[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="table-auto">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Asset</TableHead>
              <TableHead className="w-24">Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="py-3">
                  {row.href ? (
                    <Link
                      href={row.href}
                      className="hover:text-primary flex items-center gap-2 transition-colors"
                    >
                      {row.icon}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.label}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          {row.status}
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2">
                      {row.icon}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.label}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          {row.status}
                        </div>
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-3">
                  <Badge variant="outline-solid" size="sm">
                    {row.kind}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MetricTrendBadge({
  direction,
  tone,
}: {
  direction: MetricDirection;
  tone: MetricTone;
}) {
  if (direction === "flat") {
    return <Badge variant="outline-solid">Stable</Badge>;
  }

  const Icon = direction === "down" ? ArrowDownRight : ArrowUpRight;
  const variant =
    tone === "good" ? "success" : tone === "bad" ? "error" : "outline-solid";

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3.5" />
      {humanizeSegment(direction)}
    </Badge>
  );
}

function formatMetricTooltipValue(label: string, value: number) {
  if (label === "Avg cost") {
    return `$${value.toFixed(4)}`;
  }

  if (label === "Avg latency") {
    return `${value.toFixed(2)}s`;
  }

  if (label === "Avg eval score") {
    return value.toFixed(2);
  }

  return value.toString();
}

function getFolderOverviewContent(folderPath: string[]) {
  const folderKey = folderPath.join("/");

  if (folderKey === "support") {
    return {
      ...DEFAULT_FOLDER_OVERVIEW,
      datasets: [
        {
          id: "support-insight-training",
          label: "Insight training dataset",
          status: "Ready",
        },
        {
          id: "support-insight-evaluation",
          label: "Insight evaluation dataset",
          status: "Ready",
        },
      ],
    };
  }

  return DEFAULT_FOLDER_OVERVIEW;
}

function getPromptRows(projectId: string, folderPath: string[]) {
  const folderKey = folderPath.join("/");
  const promptNodes =
    getWorkspacePreviewNodes()
      .find((node) => node.pathSegments.join("/") === folderKey)
      ?.children?.filter((child) => child.kind === "prompt") ?? [];

  return promptNodes.map<AssetRow>((promptNode) => {
    const PromptIcon = getTreeIcon(promptNode.kind, promptNode.icon);

    return {
      id: promptNode.pathSegments.join("/"),
      label: humanizeSegment(promptNode.name),
      kind: "Prompt",
      status: "Open in iterate",
      href: getPromptStageHref(projectId, promptNode.pathSegments, "iterate"),
      icon: (
        <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-md">
          <PromptIcon className="text-muted-foreground size-4" />
        </span>
      ),
    };
  });
}
