import Link from "next/link";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";

export function CloudStatusMenu() {
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
