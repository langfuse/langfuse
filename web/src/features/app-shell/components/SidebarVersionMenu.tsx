import { type ComponentProps } from "react";
import { ControlledVersionMenu } from "@/src/components/nav/ControlledVersionMenu";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

/** The shell owns this menu so closing navigation also releases its modal state. */
export function SidebarVersionMenu(
  props: Pick<
    ComponentProps<typeof ControlledVersionMenu>,
    "state" | "children"
  >,
) {
  const open = useAppShellSidebar((state) => state.activeMenu === "version");
  const { setActiveMenu } = useAppShellSidebarActions();
  return (
    <ControlledVersionMenu
      {...props}
      open={open}
      onOpenChange={(isOpen) => setActiveMenu(isOpen ? "version" : null)}
    />
  );
}
