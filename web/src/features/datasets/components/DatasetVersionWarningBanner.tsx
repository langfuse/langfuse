import { Info } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/src/components/ui/button";

type DatasetVersionWarningBannerProps = {
  selectedVersion: Date;
  resetToLatest: () => void;
  className?: string;
  changeCounts?: {
    upserts: number;
    deletes: number;
  };
};

export function DatasetVersionWarningBanner({
  selectedVersion,
  resetToLatest,
  className = "",
  changeCounts,
}: DatasetVersionWarningBannerProps) {
  const totalChanges = changeCounts
    ? changeCounts.upserts + changeCounts.deletes
    : 0;
  const hasChanges = totalChanges > 0;

  return (
    <div
      className={`flex items-start gap-3 border-b border-accent-dark-blue/10 bg-accent-light-blue/30 p-3 ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <p className="break-words text-sm text-muted-foreground">
            Viewing version from{" "}
            <span className="font-medium text-foreground">
              {format(selectedVersion, "MMM d, yyyy 'at' h:mm a")}
            </span>
          </p>
          <Button
            onClick={resetToLatest}
            variant="link"
            className="h-auto shrink-0 p-0 text-sm underline-offset-4"
          >
            Return to latest
          </Button>
        </div>
        {changeCounts && hasChanges && (
          <p className="text-xs text-muted-foreground">
            {totalChanges} change{totalChanges !== 1 ? "s" : ""} since this
            version,
            {changeCounts.upserts > 0 &&
              ` ${changeCounts.upserts} upsert${changeCounts.upserts !== 1 ? "s" : ""}`}
            {changeCounts.deletes > 0 &&
              ` ${changeCounts.deletes} delete${changeCounts.deletes !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>
    </div>
  );
}
