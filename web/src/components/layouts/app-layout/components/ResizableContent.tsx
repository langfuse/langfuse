/**
 * Resizable content component for support drawer
 * Desktop: Resizable panels with programmatic control
 * Mobile: Bottom drawer
 *
 * Extracted from original layout.tsx (lines 414-493)
 */

import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { type PropsWithChildren } from "react";
import { useMediaQuery } from "react-responsive";
import dynamic from "next/dynamic";

const MobileLayout = dynamic(
  () =>
    import("@/src/components/layouts/MobileDrawer").then((mod) => ({
      default: mod.MobileDrawer,
    })),
  {
    ssr: false,
  },
);
const DesktopLayout = dynamic(
  () =>
    import("@/src/components/layouts/ResizableDesktopLayout").then((mod) => ({
      default: mod.ResizableDesktopLayout,
    })),
  {
    ssr: false,
  },
);
const SupportDrawer = dynamic(
  () =>
    import("@/src/features/support-chat/SupportDrawer").then((mod) => ({
      default: mod.SupportDrawer,
    })),
  {
    ssr: false,
  },
);

/**
 * Resizable content for support drawer on the right side of the screen (desktop).
 * On mobile, renders a Drawer instead of a resizable sidebar.
 *
 * Key optimization: Always renders ResizablePanelGroup on desktop to prevent
 * remounting children when drawer opens/closes. Uses refs for programmatic control.
 */
export function ResizableContent({ children }: PropsWithChildren) {
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const { open } = useSupportDrawer();

  if (!isDesktop) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return (
    <DesktopLayout
      mainContent={children}
      sidebarContent={<SupportDrawer />}
      open={open}
      defaultMainSize={70}
      defaultSidebarSize={30}
      minMainSize={30}
      maxSidebarSize={60}
    />
  );
}
