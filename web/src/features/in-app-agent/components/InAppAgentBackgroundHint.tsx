import { BotMessageSquare, Minus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { InAppAgentNotice } from "@/src/features/in-app-agent/components/InAppAgentNotice";

/**
 * Transient nudge that the run keeps going without the drawer. Lives in the
 * notice band, so showing it never shifts the composer or the run indicator.
 */
export function InAppAgentBackgroundHint({
  isExpanded,
  onMinimize,
}: {
  isExpanded: boolean;
  onMinimize: () => void;
}) {
  return (
    <InAppAgentNotice
      icon={<BotMessageSquare aria-hidden="true" className="size-3 shrink-0" />}
      isExpanded={isExpanded}
      role="status"
      tone="neutral"
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Minimize assistant"
          className="-my-0.5 h-5 shrink-0 gap-1 px-1"
          onClick={onMinimize}
        >
          <Minus className="size-3" />
          <span className="hidden md:inline-flex">
            <KeyboardShortcut variant="subtle" keys={["Mod", "I"]} />
          </span>
        </Button>
      }
    >
      I keep running in the background. Feel free to minimize, I&apos;ll notify
      you when I&apos;m done or need you.
    </InAppAgentNotice>
  );
}
