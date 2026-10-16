import { Skeleton } from "@/src/components/ui/skeleton";

export function ConnectionModelsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
