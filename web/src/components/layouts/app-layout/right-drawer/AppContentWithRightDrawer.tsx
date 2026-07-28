import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { type PropsWithChildren } from "react";
import { useMediaQuery } from "react-responsive";
import dynamic from "next/dynamic";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";

const DynamicMobileRightDrawer = dynamic(
  () =>
    import("./MobileRightDrawer").then((mod) => ({
      default: mod.MobileRightDrawer,
    })),
  {
    ssr: false,
  },
);

const DynamicSupportDrawer = dynamic(
  () =>
    import("@/src/features/support-chat/SupportDrawer").then((mod) => ({
      default: mod.SupportDrawer,
    })),
  {
    ssr: false,
    loading: () => <RightDrawerLoadingFallback />,
  },
);

const DynamicV4MigrationPanel = dynamic(
  () =>
    import("@/src/features/v4-migration/V4MigrationPanel").then((mod) => ({
      default: mod.V4MigrationPanel,
    })),
  {
    ssr: false,
    loading: () => <RightDrawerLoadingFallback />,
  },
);

function RightDrawerLoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Spinner size="md" variant="muted" />
    </div>
  );
}

/**
 * App-shell content wrapper that attaches the support right drawer.
 *
 * Desktop keeps a stable split wrapper so routed page content does not remount
 * when a right drawer opens or closes. Mobile uses a bottom drawer.
 */
export function AppContentWithRightDrawer({ children }: PropsWithChildren) {
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const { open: supportOpen } = useSupportDrawer();
  const { open: migrationOpen } = useV4MigrationPanel();

  if (!isDesktop) {
    return <DynamicMobileRightDrawer>{children}</DynamicMobileRightDrawer>;
  }

  const rightDrawerContent = supportOpen ? (
    <DynamicSupportDrawer />
  ) : migrationOpen ? (
    <DynamicV4MigrationPanel />
  ) : null;

  return (
    <ResizableSplitLayout
      primaryContent={children}
      secondaryContent={rightDrawerContent}
      open={supportOpen || migrationOpen}
      defaultPrimarySize={70}
      defaultSecondarySize={30}
      minPrimarySize={30}
      maxSecondarySize={60}
      keepSecondaryMounted={false}
    />
  );
}
