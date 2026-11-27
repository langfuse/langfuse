import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";

export function CloudStatusMenu({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <SidebarNavItem
      isCollapsed={isCollapsed}
      href="https://status.langfuse.com"
      isActive={false}
      opensInNewTab
      leading={
        <span className="bg-destructive inline-flex size-2 rounded-full" />
      }
      label="Active incident"
    />
  );
}
