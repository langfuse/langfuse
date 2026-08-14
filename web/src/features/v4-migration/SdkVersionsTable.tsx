import { Card } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { getSdkFreshness } from "@/src/features/v4-migration/latestSdkVersions";
import { type V4MigrationSdkUsageSeries } from "@/src/features/v4-migration/sdkVersionStatus";
import { formatCompactRelativeTime } from "@/src/utils/dates";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * One Status column, worst verdict wins, and only problems get a filled
 * pill: yellow is reserved for "act now" (migration blocker), advisory
 * freshness renders as a quiet outline, healthy rows as plain muted text —
 * so an all-green table reads calm instead of shouting.
 */
function StatusCell({ series }: { series: V4MigrationSdkUsageSeries }) {
  if (series.v4MigrationStatus === "upgrade_required") {
    return (
      <span className="bg-light-yellow text-dark-yellow inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap">
        Upgrade required
      </span>
    );
  }
  if (series.v4MigrationStatus === "unknown") {
    return (
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        Unknown
      </span>
    );
  }
  const freshness = getSdkFreshness(series);
  if (freshness === "behind") {
    return (
      <span className="border-border text-muted-foreground inline-flex w-fit shrink-0 items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap">
        Compatible · behind latest
      </span>
    );
  }
  return (
    <span className="text-muted-foreground text-xs whitespace-nowrap">
      {freshness === "current" ? "Compatible · current" : "Compatible"}
    </span>
  );
}

const seriesKey = (series: V4MigrationSdkUsageSeries) =>
  [series.source, series.sdkName, series.sdkVersion, series.publicKey].join(
    "|",
  );

// Match the checklist's naming ("Python", "JavaScript") instead of raw
// ingestion names, so the two sections on the page agree with each other.
const displaySdkName = (series: V4MigrationSdkUsageSeries) => {
  if (series.canonicalSdkName === "python") return "Python";
  if (series.canonicalSdkName === "javascript") return "JavaScript";
  return series.sdkName === "unknown" ? "Unattributed" : series.sdkName;
};

/**
 * Per-SDK-version traffic table for the Health page: every (SDK, version,
 * key) series seen in the detection window with one worst-of status verdict.
 * The verify view: post-migration, this is how a user confirms everything
 * stayed green.
 */
export function SdkVersionsTable({
  series,
}: {
  series: V4MigrationSdkUsageSeries[];
}) {
  if (series.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No ingestion detected in the last 14 days.
      </p>
    );
  }

  const rows = [...series].sort(
    (left, right) =>
      right.lastSeen.localeCompare(left.lastSeen) ||
      left.sdkName.localeCompare(right.sdkName),
  );

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="table-auto">
          <TableHeader>
            <TableRow>
              <TableHead>SDK</TableHead>
              <TableHead>Version</TableHead>
              <TableHead className="text-right">Events (14d)</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              // The API key lives in the row tooltip: it disambiguates
              // duplicate-looking rows without spending a column of
              // identical truncated prefixes.
              <TableRow key={seriesKey(row)} title={row.publicKey}>
                <TableCell density="comfortable" className="text-xs">
                  {displaySdkName(row)}
                </TableCell>
                <TableCell density="comfortable" className="font-mono text-xs">
                  {row.sdkVersion === "unknown" ? "—" : row.sdkVersion}
                </TableCell>
                <TableCell
                  density="comfortable"
                  className="text-right text-xs tabular-nums"
                >
                  {compactNumber.format(row.eventCount)}
                </TableCell>
                <TableCell
                  density="comfortable"
                  className="text-muted-foreground text-xs whitespace-nowrap"
                  title={row.lastSeen}
                >
                  {formatCompactRelativeTime(new Date(row.lastSeen))}
                </TableCell>
                <TableCell density="comfortable">
                  <StatusCell series={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
