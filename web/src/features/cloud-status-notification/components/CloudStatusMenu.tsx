/* eslint-disable @repo/no-null-render */
import { api } from "@/src/utils/api";
import Link from "next/link";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

export function CloudStatusMenu() {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { data, isLoading } = api.cloudStatus.getStatus.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    // Refresh status data every 5 minutes, keep response cached for 5 minutes
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    enabled: !!isLangfuseCloud,
  });

  // Skip component rendering if not running on Langfuse Cloud
  if (!isLangfuseCloud) {
    return null;
  }

  // Only show during an actual incident; maintenance (incl. scheduled)
  // isn't worth a nav item
  if (
    isLoading ||
    (data?.status !== "degraded" && data?.status !== "downtime")
  ) {
    return null;
  }

  return (
    <SidebarMenuButton asChild tooltip="Active incident">
      <Link
        href="https://status.langfuse.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="relative mx-1 flex h-2 w-2 shrink-0 items-center justify-center">
          <span className="bg-destructive inline-flex h-2 w-2 rounded-full" />
        </div>
        Active incident
      </Link>
    </SidebarMenuButton>
  );
}
