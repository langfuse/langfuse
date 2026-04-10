import { SidebarContent, SidebarHeader, SidebarSurface } from "../ui/sidebar";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import { SpielwieseInsertPanel } from "../components/SpielwieseInsertPanel";
import { SpielwieseVariablesPanel } from "../components/SpielwieseVariablesPanel";
import { Separator } from "../ui/separator";

type SpielwieseSidebarRightProps = {
  dashboard: SpielwieseDashboardVM;
};

export function SpielwieseSidebarRight({
  dashboard,
}: SpielwieseSidebarRightProps) {
  return (
    <SidebarSurface className="border-sidebar-border bg-background overflow-hidden border-l">
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
      <SidebarContent className="gap-5 overflow-y-auto px-3 pt-3 pb-4">
        <SpielwieseVariablesPanel variablesPanel={dashboard.variablesPanel} />
        <Separator />
        <SpielwieseInsertPanel insertPanel={dashboard.insertPanel} />
      </SidebarContent>
    </SidebarSurface>
  );
}
