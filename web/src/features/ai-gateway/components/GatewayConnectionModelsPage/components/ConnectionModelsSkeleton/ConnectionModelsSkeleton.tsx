import { Skeleton, SkeletonGroup } from "@/src/components/ui/skeleton";

export function ConnectionModelsSkeleton() {
  return (
    <SkeletonGroup className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <Skeleton className="min-h-64 w-full flex-1" />
    </SkeletonGroup>
  );
}
