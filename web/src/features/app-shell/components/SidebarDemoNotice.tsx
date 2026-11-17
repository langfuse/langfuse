import { ExternalLink, LayoutGrid } from "@langfuse/icons";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";

/** Shown in the shared, view-only demo project. */
export function SidebarDemoNotice() {
  return (
    <div className="bg-background border-sidebar-border flex flex-col gap-1 rounded-md border p-2">
      <p className="text-muted-foreground px-2 text-xs font-bold">
        Demo project (view only)
      </p>
      <SidebarNavItem
        href="https://langfuse.com/docs/demo"
        isActive={false}
        opensInNewTab
        leading={<ExternalLink size="base" />}
        label="Use Demo App"
      />
      <SidebarNavItem
        href="/organizations"
        isActive={false}
        opensInNewTab={false}
        leading={<LayoutGrid size="base" />}
        label="Your organizations"
      />
    </div>
  );
}
