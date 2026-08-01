import { Skeleton } from "@/src/components/ui/skeleton";
import type { EvaluatorVersion } from "./types";

export function EvaluatorVersionHistoryList({
  versions,
  currentVersionId,
  isLoading,
  onSelectVersion,
}: {
  versions: EvaluatorVersion[];
  currentVersionId: string;
  isLoading: boolean;
  onSelectVersion: (versionId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (versions.length === 0)
    return (
      <p className="text-muted-foreground text-sm">No saved versions found.</p>
    );

  return (
    <div className="flex flex-col gap-2">
      {versions.map((version) => (
        <button
          key={version.id}
          type="button"
          className="hover:bg-muted/50 flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors"
          onClick={() => onSelectVersion(version.id)}
        >
          <div className="min-w-0">
            <p
              className="truncate text-sm font-bold"
              title={`Version ${version.version}`}
            >
              Version {version.version}
            </p>
            <p className="text-muted-foreground text-xs">
              {version.createdAt.toLocaleString()}
            </p>
          </div>
          {version.id === currentVersionId ? (
            <span className="bg-light-green text-dark-green rounded-md px-2 py-0.5 text-xs font-bold">
              Current
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
