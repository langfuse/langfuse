import type { ReactNode } from "react";

import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";

/**
 * Mirrors the models table: the search field, then `filters` (live, so the provider
 * select stays usable), then the table. Without `filters`, they are skeletons too.
 */
export function ConnectionModelsSkeleton({ filters }: { filters?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <span className="sr-only">Loading models</span>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SkeletonGroup className="w-full max-w-120 md:w-96">
          <Skeleton className="h-8 w-full" />
        </SkeletonGroup>
        {filters ?? (
          <SkeletonGroup className="flex items-center gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="size-8" />
          </SkeletonGroup>
        )}
      </div>
      <SkeletonGroup className="flex min-h-0 flex-1 flex-col">
        <Skeleton className="min-h-64 w-full flex-1" />
      </SkeletonGroup>
    </div>
  );
}
