import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";
import {
  useAssistantStage,
  useAssistantStagePhase,
} from "@/src/features/in-app-agent/stage/AssistantStageProvider";
import type { AssistantStageEntryPoint } from "@/src/features/in-app-agent/stage/state/assistantStageStore";
import { cn } from "@/src/utils/tailwind";

const VARIANT_ENTRY_POINTS: Record<
  "header" | "mobileTopBar",
  AssistantStageEntryPoint
> = {
  header: "top_nav",
  mobileTopBar: "mobile_top_bar",
};

/**
 * Opens the assistant with the current page attached. Hover, focus and touch
 * start the page capture early, so the flight usually starts on the click.
 * Render only where `useAssistantStage()` is non-null.
 */
export function AssistantStageLauncherButton({
  variant,
}: {
  variant: "header" | "mobileTopBar";
}) {
  const stage = useAssistantStage();
  const phase = useAssistantStagePhase();
  if (!stage) {
    throw new Error(
      "AssistantStageLauncherButton must be rendered inside AssistantStageProvider",
    );
  }
  const isOpen = phase !== "closed";
  const isTopBar = variant === "mobileTopBar";

  return (
    <Button
      type="button"
      variant="outline"
      aria-label={`${isOpen ? "Close" : "Open"} the assistant with this page attached`}
      aria-pressed={isOpen}
      aria-busy={phase === "preparing"}
      onPointerEnter={stage.prewarm}
      onFocus={stage.prewarm}
      onTouchStart={stage.prewarm}
      onClick={() => {
        stage.toggle(VARIANT_ENTRY_POINTS[variant]);
      }}
      className={cn(
        "relative gap-2",
        // 40px touch target in the mobile top bar.
        isTopBar && "size-10 shrink-0 px-0",
        phase === "preparing" && "animate-pulse",
      )}
    >
      <HaloIcon variant="launcher" />
      {isTopBar ? null : (
        <>
          <span className="hidden sm:inline">Assistant</span>
          <span className="hidden md:inline-flex">
            <KeyboardShortcut variant="subtle" keys={["Mod", "I"]} />
          </span>
        </>
      )}
    </Button>
  );
}
