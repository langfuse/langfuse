import { type ComponentProps } from "react";
import { ControlledVersionMenu } from "@/src/components/nav/ControlledVersionMenu";
import {
  useAppShellSidebar,
  useAppShellSidebarStoreApi,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

import { createSidebarMenuControls } from "@/src/features/app-shell/fns/createSidebarMenuControls";

/** The shell owns this menu so closing navigation also releases its modal state. */
export function SidebarVersionMenu(
  props: Pick<
    ComponentProps<typeof ControlledVersionMenu>,
    "state" | "children"
  >,
) {
  const open = useAppShellSidebar((state) => state.activeMenu === "version");
  const store = useAppShellSidebarStoreApi();
  const controls = createSidebarMenuControls(store, "version");
  return <ControlledVersionMenu {...props} open={open} {...controls} />;
}
