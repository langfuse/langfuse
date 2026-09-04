import { Skeleton } from "@/src/components/ui/skeleton";

// Placeholder for an integration settings form that is not mounted yet. The
// forms capture their defaults on first render, so each settings page holds
// this until every async input has resolved.
export const IntegrationSettingsSkeleton = () => (
  <div className="space-y-3">
    <Skeleton className="h-9 w-full" />
    <Skeleton className="h-9 w-full" />
    <Skeleton className="h-9 w-full" />
  </div>
);
