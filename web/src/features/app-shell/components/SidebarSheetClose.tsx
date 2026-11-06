import { X } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useAppShellSidebarActions } from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

/** Closes the mobile navigation drawer; it takes the pin toggle's place there. */
export function SidebarSheetClose() {
  const { setMobileOpen } = useAppShellSidebarActions();
  return (
    <IconButton
      icon={X}
      label="Close navigation"
      size="md"
      onClick={() => setMobileOpen(false)}
    />
  );
}
