import { Info } from "lucide-react";
import { format } from "date-fns";

type DatasetVersionWarningBannerProps = {
  selectedVersion: Date;
  resetToLatest: () => void;
  variant?: "inline" | "compact";
  className?: string;
};

export function DatasetVersionWarningBanner({
  selectedVersion,
  resetToLatest,
  variant = "inline",
  className = "",
}: DatasetVersionWarningBannerProps) {
  if (variant === "compact") {
    return (
      <div
        className={`flex items-start gap-3 border-b border-accent-dark-blue/10 bg-accent-light-blue/30 p-3 ${className}`}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="break-words text-sm text-muted-foreground">
            Viewing version from{" "}
            <span className="font-medium text-foreground">
              {format(selectedVersion, "MMM d, yyyy 'at' h:mm a")}
            </span>
          </p>
          <button
            onClick={resetToLatest}
            className="w-fit text-sm underline underline-offset-4 hover:text-foreground"
          >
            Return to latest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-accent-dark-blue/10 bg-accent-light-blue/30 p-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <Info className="h-4 w-4 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Viewing version from{" "}
          <span className="font-medium text-foreground">
            {format(selectedVersion, "MMM d, yyyy 'at' h:mm a")}
          </span>
          . Read-only mode.
        </p>
      </div>
      <button
        onClick={resetToLatest}
        className="shrink-0 text-sm underline underline-offset-4 hover:text-foreground"
      >
        Return to latest
      </button>
    </div>
  );
}
