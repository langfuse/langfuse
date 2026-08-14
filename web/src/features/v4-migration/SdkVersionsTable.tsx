import { Card } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  FALLBACK_LATEST_SDK_VERSIONS,
  getSdkFreshness,
  type SdkFreshness,
} from "@/src/features/v4-migration/latestSdkVersions";
import { type V4MigrationSdkUsageSeries } from "@/src/features/v4-migration/sdkVersionStatus";
import { api } from "@/src/utils/api";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function Pill({
  tone,
  children,
}: {
  tone: "green" | "yellow" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
        tone === "green" && "bg-light-green text-dark-green",
        tone === "yellow" && "bg-light-yellow text-dark-yellow",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function CompatibilityPill({ series }: { series: V4MigrationSdkUsageSeries }) {
  if (series.v4MigrationStatus === "compatible")
    return <Pill tone="green">Compatible</Pill>;
  if (series.v4MigrationStatus === "upgrade_required")
    return <Pill tone="yellow">Upgrade required</Pill>;
  return <Pill tone="muted">Unknown</Pill>;
}

function FreshnessPill({ freshness }: { freshness: SdkFreshness }) {
  if (freshness === "current") return <Pill tone="green">Current</Pill>;
  if (freshness === "behind") return <Pill tone="yellow">Behind</Pill>;
  return null;
}

const seriesKey = (series: V4MigrationSdkUsageSeries) =>
  [series.source, series.sdkName, series.sdkVersion, series.publicKey].join(
    "|",
  );

const displaySdkName = (series: V4MigrationSdkUsageSeries) =>
  series.sdkName === "unknown" ? "Unattributed" : series.sdkName;

/**
 * Per-SDK-version traffic table for the Health page: every (SDK, version,
 * key) series seen in the detection window, with the migration compatibility
 * verdict and, for current-major series, freshness against the latest
 * released version. The verify view: post-migration, this is how a user
 * confirms everything stayed green.
 */
export function SdkVersionsTable({
  series,
}: {
  series: V4MigrationSdkUsageSeries[];
}) {
  // Registry-backed latest versions; the pinned fallback keeps freshness
  // rendering while the query loads (or if it fails — the server also
  // degrades to the same constants).
  const { data: latestSdkVersions } =
    api.v4Transition.latestSdkVersions.useQuery(undefined, {
      staleTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    });
  const latestByCanonicalName =
    latestSdkVersions ?? FALLBACK_LATEST_SDK_VERSIONS;

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
              <TableHead>API key</TableHead>
              <TableHead className="text-right">Events (14d)</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Compatibility</TableHead>
              <TableHead>Freshness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={seriesKey(row)}>
                <TableCell className="font-mono text-xs">
                  {displaySdkName(row)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.sdkVersion === "unknown" ? "—" : row.sdkVersion}
                </TableCell>
                <TableCell
                  className="text-muted-foreground max-w-[10rem] truncate font-mono text-xs"
                  title={row.publicKey}
                >
                  {row.publicKey || "—"}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {compactNumber.format(row.eventCount)}
                </TableCell>
                <TableCell
                  className="text-muted-foreground text-xs whitespace-nowrap"
                  title={row.lastSeen}
                >
                  {formatCompactRelativeTime(new Date(row.lastSeen))}
                </TableCell>
                <TableCell>
                  <CompatibilityPill series={row} />
                </TableCell>
                <TableCell>
                  <FreshnessPill
                    freshness={getSdkFreshness(row, latestByCanonicalName)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
