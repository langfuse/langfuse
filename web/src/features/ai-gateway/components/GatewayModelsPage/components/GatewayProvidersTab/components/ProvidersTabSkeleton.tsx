import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayProviderCardGrid } from "./GatewayProviderCardGrid";

export function ProvidersTabSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gateway-providers-loading"
    >
      <Skeleton className="h-7 w-56" />
      <GatewayProviderCardGrid>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </GatewayProviderCardGrid>
    </div>
  );
}
