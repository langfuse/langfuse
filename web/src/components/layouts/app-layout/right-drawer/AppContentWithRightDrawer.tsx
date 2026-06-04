import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { type PropsWithChildren } from "react";
import { useMediaQuery } from "react-responsive";
import dynamic from "next/dynamic";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
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

const DynamicControlledInAppAgentDrawer = dynamic(
  () =>
    import("@/src/features/in-app-agent/components").then((mod) => ({
      default: mod.ControlledInAppAgentDrawer,
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
 * App-shell content wrapper that attaches the support / AI assistant right drawer.
 *
 * Desktop keeps a stable split wrapper so routed page content does not remount
 * when a right drawer opens or closes. Mobile uses a bottom drawer.
 */
export function AppContentWithRightDrawer({
  aiAgentEnabled,
  children,
}: PropsWithChildren<{ aiAgentEnabled?: boolean }>) {
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const { open: supportOpen } = useSupportDrawer();
  const { open: aiAgentOpen, setOpen: setAiAgentOpen } = useInAppAiAgent();
  const showAiAgent = Boolean(aiAgentEnabled && aiAgentOpen);
  const showRightDrawer = showAiAgent || supportOpen;

  if (!isDesktop) {
    return (
      <DynamicMobileRightDrawer aiAgentEnabled={aiAgentEnabled}>
        {children}
      </DynamicMobileRightDrawer>
    );
  }

  const rightDrawerContent = showAiAgent ? (
    <DynamicControlledInAppAgentDrawer onClose={() => setAiAgentOpen(false)} />
  ) : supportOpen ? (
    <DynamicSupportDrawer />
  ) : null;

  return (
    <ResizableSplitLayout
      primaryContent={children}
      secondaryContent={rightDrawerContent}
      open={showRightDrawer}
      showHandle={showAiAgent}
      defaultPrimarySize={showAiAgent ? 72 : 70}
      defaultSecondarySize={showAiAgent ? 28 : 30}
      minPrimarySize={30}
      maxSecondarySize={60}
      keepSecondaryMounted={false}
      persistId={showAiAgent ? "assistant-sidebar" : undefined}
    />
  );
}
