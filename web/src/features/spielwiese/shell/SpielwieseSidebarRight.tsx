import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
  SidebarSurface,
} from "../ui/sidebar";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import { ActivityRail } from "../components/ActivityRail";

type SpielwieseSidebarRightProps = {
  dashboard: SpielwieseDashboardVM;
  shell: SpielwieseShellVM;
};

export function SpielwieseSidebarRight({
  dashboard,
  shell,
}: SpielwieseSidebarRightProps) {
  return (
    <SidebarSurface className="border-sidebar-border/70 border-l">
      <SidebarHeader className="border-sidebar-border/70 gap-3 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="size-10 rounded-[1rem]">
            <AvatarFallback className="rounded-[1rem]">
              {shell.user.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">
              {shell.user.name}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {shell.user.email}
            </p>
          </div>
        </div>
        <div className="border-sidebar-border/70 bg-background/65 rounded-[1.25rem] border p-3">
          <p className="text-foreground text-sm font-medium">
            {shell.rightRailTitle}
          </p>
          <p className="text-muted-foreground text-sm">
            Small context stays visible while the center canvas remains clean.
          </p>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="overflow-y-auto">
        <ActivityRail activity={dashboard.activity} />
      </SidebarContent>
    </SidebarSurface>
  );
}
