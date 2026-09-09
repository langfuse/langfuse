import { Download } from "lucide-react";

import Page from "@/src/components/layouts/page";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { VERSION } from "@/src/constants";
import {
  buildInstanceUsageCsv,
  daysElapsedInMonth,
  instanceUsageCsvFilename,
  type InstanceDataModel,
  type InstanceUsageResponse,
} from "@/src/features/instance-usage/lib/instanceUsage";
import { api } from "@/src/utils/api";
import { numberFormatter } from "@/src/utils/numbers";

const dataModelLabels: Record<InstanceDataModel, string> = {
  legacy: "Legacy tables (v3)",
  dual: "Dual write (v3 and v4)",
  events_only: "Events tables (v4)",
};

const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return "n/a";
  if (bytes === 0) return "0 B";

  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const downloadCsv = (data: InstanceUsageResponse) => {
  const now = new Date();
  const blob = new Blob(
    [buildInstanceUsageCsv({ data, version: VERSION, now })],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = instanceUsageCsvFilename(now);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const SummaryItem = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="text-sm">{value}</span>
    {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
  </div>
);

const InstanceSummary = ({ data }: { data: InstanceUsageResponse }) => {
  const totalOnDisk = data.storage.reduce(
    (sum, table) => sum + table.onDiskBytes,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instance</CardTitle>
        <CardDescription>
          Configuration and scope of this deployment.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryItem label="Version" value={VERSION} />
        <SummaryItem
          label="Data model"
          value={dataModelLabels[data.instance.dataModel]}
        />
        <SummaryItem
          label="Organizations"
          value={numberFormatter(data.instance.organizations, 0)}
        />
        <SummaryItem
          label="Projects"
          value={numberFormatter(data.instance.projects, 0)}
          hint={`${numberFormatter(data.instance.projectsWithRetention, 0)} with data retention configured`}
        />
        <SummaryItem
          label="Users"
          value={numberFormatter(data.instance.users, 0)}
        />
        <SummaryItem
          label="ClickHouse on disk"
          value={formatBytes(totalOnDisk)}
          hint="Tracing tables, one replica"
        />
        <SummaryItem
          label="Postgres size"
          value={formatBytes(data.instance.postgresBytes)}
        />
        <SummaryItem
          label="Data range"
          value={
            data.months.length > 0
              ? `${data.months[data.months.length - 1].month} to ${data.months[0].month}`
              : "no data"
          }
        />
      </CardContent>
    </Card>
  );
};

const MonthlyUsageTable = ({ data }: { data: InstanceUsageResponse }) => {
  const now = new Date();
  const totals = data.months.reduce(
    (sum, month) => ({
      tracingUnits: sum.tracingUnits + month.tracingUnits,
      onDiskBytes: sum.onDiskBytes + month.onDiskBytes,
      counts: Object.fromEntries(
        data.entities.map((entity) => [
          entity.key,
          (sum.counts[entity.key] ?? 0) + (month.counts[entity.key] ?? 0),
        ]),
      ),
    }),
    {
      tracingUnits: 0,
      onDiskBytes: 0,
      counts: {} as Record<string, number>,
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage by month</CardTitle>
        <CardDescription>
          Tracing units are the sum of the entities below, counted from{" "}
          {data.entities.map((entity) => entity.table).join(", ")}. Months are
          bucketed by event timestamp, in UTC.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              {data.entities.map((entity) => (
                <TableHead key={entity.key} className="text-right">
                  {entity.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Tracing units</TableHead>
              <TableHead className="text-right">Units / day</TableHead>
              <TableHead className="text-right">On disk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.months.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={data.entities.length + 4}
                  className="text-muted-foreground"
                >
                  No tracing data on this instance yet.
                </TableCell>
              </TableRow>
            ) : (
              data.months.map((month) => {
                const days = daysElapsedInMonth(month.month, now);
                return (
                  <TableRow key={month.month}>
                    <TableCell>
                      {month.month}
                      {month.isPartial && (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          month to date
                        </span>
                      )}
                    </TableCell>
                    {data.entities.map((entity) => (
                      <TableCell key={entity.key} className="text-right">
                        {numberFormatter(month.counts[entity.key] ?? 0, 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold">
                      {numberFormatter(month.tracingUnits, 0)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right">
                      {days > 0
                        ? numberFormatter(month.tracingUnits / days, 0)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatBytes(month.onDiskBytes)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {data.months.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">Total</TableCell>
                {data.entities.map((entity) => (
                  <TableCell key={entity.key} className="text-right">
                    {numberFormatter(totals.counts[entity.key] ?? 0, 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold">
                  {numberFormatter(totals.tracingUnits, 0)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right">
                  {formatBytes(totals.onDiskBytes)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
};

const StorageTable = ({ data }: { data: InstanceUsageResponse }) => (
  <Card>
    <CardHeader>
      <CardTitle>Storage by table</CardTitle>
      <CardDescription>
        ClickHouse footprint of one replica. Uncompressed size and the resulting
        compression ratio help estimate how the instance scales with retention.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Table</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">On disk</TableHead>
            <TableHead className="text-right">Uncompressed</TableHead>
            <TableHead className="text-right">Ratio</TableHead>
            <TableHead className="text-right">Months</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.storage.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No partitions found.
              </TableCell>
            </TableRow>
          ) : (
            data.storage.map((table) => (
              <TableRow key={table.table}>
                <TableCell className="font-mono text-xs">
                  {table.table}
                </TableCell>
                <TableCell className="text-right">
                  {numberFormatter(table.rows, 0)}
                </TableCell>
                <TableCell className="text-right">
                  {formatBytes(table.onDiskBytes)}
                </TableCell>
                <TableCell className="text-right">
                  {formatBytes(table.uncompressedBytes)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  {table.onDiskBytes > 0
                    ? `${(table.uncompressedBytes / table.onDiskBytes).toFixed(1)}x`
                    : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground text-right">
                  {numberFormatter(table.partitions, 0)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

export default function InstanceUsage() {
  const usage = api.instanceUsage.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  return (
    <Page
      scrollable
      withPadding
      headerProps={{
        title: "Instance Usage",
        help: {
          description:
            "Volume and storage footprint of this Langfuse instance, aggregated across all organizations. Useful when sizing a deployment.",
        },
        actionButtonsRight: (
          <Button
            variant="secondary"
            size="sm"
            disabled={!usage.data}
            onClick={() => usage.data && downloadCsv(usage.data)}
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        ),
      }}
    >
      <div className="flex flex-col gap-4">
        {usage.isError && (
          <Alert variant="destructive">
            <AlertDescription>{usage.error.message}</AlertDescription>
          </Alert>
        )}
        {usage.data?.warnings.map((warning) => (
          <Alert key={warning}>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ))}
        {usage.isPending && (
          <p className="text-muted-foreground text-sm">Loading …</p>
        )}
        {usage.data && (
          <>
            <InstanceSummary data={usage.data} />
            <MonthlyUsageTable data={usage.data} />
            <StorageTable data={usage.data} />
            <p className="text-muted-foreground text-xs">
              Counts come from ClickHouse partition metadata, so they are read
              without scanning the tables and stay fast on any instance size.
              They count stored rows: updates to the same entity add a row
              version until background merges collapse them, which makes these
              numbers an upper bound on distinct entities. Sizes are for a
              single replica and exclude blob storage.
            </p>
          </>
        )}
      </div>
    </Page>
  );
}
