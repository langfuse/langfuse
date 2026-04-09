import { SidebarContent, SidebarHeader, SidebarSurface } from "../ui/sidebar";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import { SpielwieseInsertPanel } from "../components/SpielwieseInsertPanel";

type SpielwieseSidebarRightProps = {
  dashboard: SpielwieseDashboardVM;
};

export function SpielwieseSidebarRight({
  dashboard,
}: SpielwieseSidebarRightProps) {
  return (
    <SidebarSurface className="border-sidebar-border bg-background border-l">
      <SidebarHeader className="border-sidebar-border gap-0 border-b px-4 py-0">
        <div className="-mx-1 flex h-12 items-center gap-1">
          {dashboard.insertPanel.tabs.map((tab) => (
            <button
              key={tab}
              className={cn(
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                tab === dashboard.insertPanel.activeTab &&
                  "bg-secondary text-foreground shadow-xs",
              )}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto p-2">
        <SpielwieseInsertPanel insertPanel={dashboard.insertPanel} />
      </SidebarContent>
    </SidebarSurface>
  );
}
