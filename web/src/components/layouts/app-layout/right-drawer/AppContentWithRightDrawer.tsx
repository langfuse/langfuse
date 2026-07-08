import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
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

  if (!isDesktop) {
    return <DynamicMobileRightDrawer>{children}</DynamicMobileRightDrawer>;
  }

  const rightDrawerContent = supportOpen ? <DynamicSupportDrawer /> : null;

  return (
    <ResizableSplitLayout
      primaryContent={children}
      secondaryContent={rightDrawerContent}
      open={supportOpen}
      defaultPrimarySize={70}
      defaultSecondarySize={30}
      minPrimarySize={30}
      maxSecondarySize={60}
      keepSecondaryMounted={false}
    />
  );
}
