import { useSupportDrawer } from "@/src/app/support";
import { useV4MigrationPanel } from "@/src/migrations/v4/upgrade-experience/V4MigrationPanelProvider";
import { type PropsWithChildren } from "react";
import { useMediaQuery } from "react-responsive";
import dynamic from "next/dynamic";
import { Spinner } from "@/src/app/design-system/Spinner/Spinner";
import { ResizableSplitLayout } from "@/src/app/design-system/legacy-primitives/resizable-split-layout";

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
    import("@/src/app/support/SupportDrawer").then((mod) => ({
      default: mod.SupportDrawer,
    })),
  {
    ssr: false,
    loading: () => <RightDrawerLoadingFallback />,
  },
);

const DynamicV4MigrationPanel = dynamic(
  () =>
    import("@/src/migrations/v4/upgrade-experience/V4MigrationPanel").then(
      (mod) => ({
        default: mod.V4MigrationPanel,
      }),
    ),
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
 * Routed page content keeps a stable split wrapper across viewport changes.
 * Desktop uses the secondary panel; mobile drawers render as sibling overlays.
 */
export function AppContentWithRightDrawer({ children }: PropsWithChildren) {
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const { open: supportOpen } = useSupportDrawer();
  const { open: migrationOpen } = useV4MigrationPanel();

  const rightDrawerContent = (() => {
    if (supportOpen) {
      return <DynamicSupportDrawer />;
    }
    if (migrationOpen) {
      return <DynamicV4MigrationPanel />;
    }
    return null;
  })();

  return (
    <>
      <ResizableSplitLayout
        primaryContent={children}
        secondaryContent={rightDrawerContent}
        open={isDesktop && (supportOpen || migrationOpen)}
        defaultPrimarySize={supportOpen ? 70 : 60}
        // The migration panel carries denser content than the support drawer,
        // so it opens wider by default.
        defaultSecondarySize={supportOpen ? 30 : 40}
        minPrimarySize={30}
        maxSecondarySize={60}
        keepSecondaryMounted={false}
      />
      {!isDesktop && <DynamicMobileRightDrawer />}
    </>
  );
}
