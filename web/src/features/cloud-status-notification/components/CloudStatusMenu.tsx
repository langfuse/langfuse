import { api } from "@/src/utils/api";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";

export function CloudStatusMenu() {
  const { data, isLoading } = api.cloudStatus.getStatus.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    // Refresh status data every 5 minutes, keep response cached for 5 minutes
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    enabled: !!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  });

  // Skip component rendering if not running on Langfuse Cloud
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return null;
  }

  // Don't show anything while loading or if there's no incident
  if (isLoading || data?.status === null || data?.status === "operational") {
    return null;
  }

  return (
    <SidebarMenuButton asChild tooltip="Status">
      <Link
        href="https://status.langfuse.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="relative mx-1 flex h-2 w-2 items-center justify-center">
          <span
            className={cn(
              "absolute inline-flex h-2 w-2 animate-ping rounded-full bg-yellow-500 opacity-75",
            )}
          ></span>
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full bg-yellow-600",
            )}
          ></span>
        </div>
        Status
      </Link>
    </SidebarMenuButton>
  );
}
