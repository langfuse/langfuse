import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { api } from "@/src/utils/api";
import { useDatasetVersion } from "../hooks/useDatasetVersion";
import { Clock, MoreVertical, Copy, ExternalLink } from "lucide-react";
import {
  format,
  isToday,
  isYesterday,
  isWithinInterval,
  subDays,
  startOfDay,
  formatDistanceToNow,
} from "date-fns";
import { cn } from "@/src/utils/tailwind";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

type DatasetVersionHistoryPanelProps = {
  projectId: string;
  datasetId: string;
  itemVersions?: Date[]; // Optional: versions where a specific item changed
};

type GroupedVersions = {
  today: Date[];
  yesterday: Date[];
  last7Days: Date[];
  last30Days: Date[];
  older: Date[];
};

function groupVersionsByTime(versions: Date[]): GroupedVersions {
  const now = new Date();
  const dayStart = startOfDay(now);
  const sevenDaysAgo = subDays(now, 7);
  const thirtyDaysAgo = subDays(now, 30);

  return {
    today: versions.filter((v) => isToday(v)),
    yesterday: versions.filter((v) => isYesterday(v)),
    last7Days: versions.filter(
      (v) =>
        !isToday(v) &&
        !isYesterday(v) &&
        isWithinInterval(v, { start: sevenDaysAgo, end: dayStart }),
    ),
    last30Days: versions.filter(
      (v) =>
        !isWithinInterval(v, { start: sevenDaysAgo, end: now }) &&
        isWithinInterval(v, { start: thirtyDaysAgo, end: now }),
    ),
    older: versions.filter((v) => v < thirtyDaysAgo),
  };
}

export function DatasetVersionHistoryPanel({
  projectId,
  datasetId,
  itemVersions,
}: DatasetVersionHistoryPanelProps) {
  const { selectedVersion, setSelectedVersion, resetToLatest } =
    useDatasetVersion();

  const { data: versions, isLoading } =
    api.datasets.listDatasetVersions.useQuery({
      projectId,
      datasetId,
    });

  const copyVersionTimestamp = (version: Date) => {
    const isoTimestamp = version.toISOString();
    navigator.clipboard.writeText(isoTimestamp);
    showSuccessToast({
      title: "Copied!",
      description: `Version timestamp: ${isoTimestamp}`,
    });
  };

  const openDocumentation = () => {
    window.open(
      "https://langfuse.com/docs/datasets/dataset-versioning",
      "_blank",
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center text-sm text-muted-foreground">
          <Clock className="mx-auto mb-2 h-8 w-8" />
          <p>No versions found</p>
        </div>
      </div>
    );
  }

  const latestVersion = versions[0];
  const groupedVersions = groupVersionsByTime(versions);

  const renderVersionItem = (version: Date, index: number) => {
    const isLatest = index === 0 && version === latestVersion;
    const isSelected =
      selectedVersion?.getTime() === version.getTime() ||
      (isLatest && !selectedVersion);

    // Check if this version has item-specific changes
    const isItemVersion = itemVersions?.some(
      (iv) => iv.getTime() === version.getTime(),
    );

    return (
      <div
        key={version.toISOString()}
        className="group relative flex items-center gap-1"
      >
        <Button
          onClick={() => {
            if (isLatest) {
              resetToLatest();
            } else {
              setSelectedVersion(version);
            }
          }}
          variant="ghost"
          className={cn(
            "flex h-auto flex-1 flex-col items-start gap-1 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
            isSelected && "bg-muted font-medium hover:bg-muted",
          )}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {isItemVersion && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  title="Item modified in this version"
                />
              )}
              <span className={cn("truncate", isSelected && "text-foreground")}>
                {format(version, "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
            {isLatest && (
              <span className="shrink-0 rounded-md bg-accent-light-green px-2 py-0.5 text-xs font-medium text-accent-dark-green dark:bg-accent-dark-green dark:text-accent-light-green">
                Latest
              </span>
            )}
          </div>
          <span
            className={cn(
              "text-xs",
              isSelected ? "text-muted-foreground" : "text-muted-foreground",
            )}
          >
            {formatDistanceToNow(version, { addSuffix: true })}
          </span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Version actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                copyVersionTimestamp(version);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy version timestamp (UTC)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openDocumentation();
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              How to use in experiments
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <h3 className="text-lg font-semibold">Version History</h3>
        <p className="text-sm text-muted-foreground">
          {versions.length} version{versions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Versions List */}
      <div className="flex-1 overflow-y-auto">
        <Accordion type="multiple" defaultValue={["today"]}>
          {/* Today */}
          {groupedVersions.today.length > 0 && (
            <AccordionItem value="today" className="px-2">
              <AccordionTrigger className="text-sm font-medium">
                Today ({groupedVersions.today.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-1">
                  {groupedVersions.today.map((v, i) => renderVersionItem(v, i))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Yesterday */}
          {groupedVersions.yesterday.length > 0 && (
            <AccordionItem value="yesterday" className="px-2">
              <AccordionTrigger className="text-sm font-medium">
                Yesterday ({groupedVersions.yesterday.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-1">
                  {groupedVersions.yesterday.map((v) =>
                    renderVersionItem(v, versions.indexOf(v)),
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Last 7 Days */}
          {groupedVersions.last7Days.length > 0 && (
            <AccordionItem value="last7days" className="px-2">
              <AccordionTrigger className="text-sm font-medium">
                Last 7 Days ({groupedVersions.last7Days.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-1">
                  {groupedVersions.last7Days.map((v) =>
                    renderVersionItem(v, versions.indexOf(v)),
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Last 30 Days */}
          {groupedVersions.last30Days.length > 0 && (
            <AccordionItem value="last30days" className="px-2">
              <AccordionTrigger className="text-sm font-medium">
                Last 30 Days ({groupedVersions.last30Days.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-1">
                  {groupedVersions.last30Days.map((v) =>
                    renderVersionItem(v, versions.indexOf(v)),
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Older */}
          {groupedVersions.older.length > 0 && (
            <AccordionItem value="older" className="px-2">
              <AccordionTrigger className="text-sm font-medium">
                Older ({groupedVersions.older.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-1">
                  {groupedVersions.older.map((v) =>
                    renderVersionItem(v, versions.indexOf(v)),
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </div>
  );
}
