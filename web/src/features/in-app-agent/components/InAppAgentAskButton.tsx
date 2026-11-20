import { ArrowUp } from "@langfuse/icons";

import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Button } from "@/src/components/ui/button";

/**
 * Submit button for an assistant composer: arrow, label and the submit
 * shortcut in one button, the way the Halo launcher carries its own.
 */
export function InAppAgentAskButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      aria-label="Ask"
      disabled={disabled}
      onClick={onClick}
      className="gap-2"
    >
      <ArrowUp size="base" color="inherit" aria-hidden />
      <span>Ask</span>
      <span className="inline-flex">
        <KeyboardShortcut variant="subtle" keys={["Mod", "Enter"]} />
      </span>
    </Button>
  );
}
