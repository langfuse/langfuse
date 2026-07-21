import { type ReactNode } from "react";
import { BotMessageSquare, ListFilter, RefreshCw, Clock } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  MobileBottomBarPortal,
  useMobileBottomBar,
} from "@/src/components/layouts/mobile-bottom-bar/mobile-bottom-bar-context";
import {
  useCanUseInAppAgent,
  useInAppAiAgent,
} from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";

/**
 * Demo action set for the LFE-11067 mobile bottom bar (decision surface).
 *
 * Wires the real in-app agent into the bar via the {@link MobileBottomBarPortal}
 * seam (the "Ask AI" action opens the live assistant), alongside placeholder
 * Filters / Time range / Refresh actions that stand in for the per-page controls
 * a later slice will migrate here from the top bar. Mounted from the traces page;
 * the whole thing is only ever visible below `md`, where the bar renders.
 */
export function MobileBottomBarDemoActions() {
  const ctx = useMobileBottomBar();
  const canUseAgent = useCanUseInAppAgent();
  const { openAssistant } = useInAppAiAgent();

  const openAgent = () => {
    ctx?.setExpanded(false);
    openAssistant("mobile_bottom_bar");
  };

  return (
    <>
      {/* Collapsed pill: 1-2 icon-first quick actions + the shell's expand
          handle. "Ask AI" is live; "Filters" opens the sheet where the fuller
          control set lives. */}
      <MobileBottomBarPortal region="bar">
        {canUseAgent ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Ask Langfuse AI"
            onClick={openAgent}
          >
            <BotMessageSquare className="h-5 w-5" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Filters"
          onClick={() => ctx?.setExpanded(true)}
        >
          <ListFilter className="h-5 w-5" />
        </Button>
      </MobileBottomBarPortal>

      {/* Expanded sheet: the fuller, labelled action set. "Ask AI" is live; the
          rest are disabled placeholders for the per-page controls a later slice
          migrates here — rendered as visibly `disabled` with a "Soon" badge so a
          mobile user never taps a live-looking button that silently does
          nothing. */}
      <MobileBottomBarPortal region="sheet">
        {canUseAgent ? (
          <Button
            type="button"
            variant="default"
            className="w-full justify-start gap-2"
            onClick={openAgent}
          >
            <BotMessageSquare className="h-4 w-4" />
            Ask Langfuse AI
          </Button>
        ) : null}
        <PlaceholderAction icon={<ListFilter className="h-4 w-4" />}>
          Filters
        </PlaceholderAction>
        <PlaceholderAction icon={<Clock className="h-4 w-4" />}>
          Time range
        </PlaceholderAction>
        <PlaceholderAction icon={<RefreshCw className="h-4 w-4" />}>
          Refresh
        </PlaceholderAction>
      </MobileBottomBarPortal>
    </>
  );
}

/** A not-yet-wired sheet action: visibly disabled with a "Soon" badge so it
 * reads as upcoming rather than broken, and cannot be tapped to a no-op. */
function PlaceholderAction({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start gap-2"
      disabled
    >
      {icon}
      {children}
      <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-xs">
        Soon
      </span>
    </Button>
  );
}
