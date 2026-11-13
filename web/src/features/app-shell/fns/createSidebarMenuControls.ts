import {
  type SidebarMenu,
  type SidebarStore,
} from "@/src/features/app-shell/stores/sidebarStore";

/** Menu exit callbacks read the live owner because a sibling may already have opened. */
export function createSidebarMenuControls(
  store: SidebarStore,
  menu: SidebarMenu,
) {
  return {
    onOpenChange: (isOpen: boolean) => {
      const { activeMenu, actions } = store.getState();
      if (isOpen) actions.setActiveMenu(menu);
      else if (activeMenu === menu) actions.setActiveMenu(null);
    },
    onCloseAutoFocus: (event: Event) => {
      const { activeMenu, isMobile, isMobileOpen } = store.getState();
      if (activeMenu !== null || (isMobile && !isMobileOpen))
        event.preventDefault();
    },
  };
}
