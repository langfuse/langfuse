import { ArrowUp } from "@langfuse/icons";

import {
  KeyboardShortcut,
  type KeyboardShortcutProps,
} from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Button } from "@/src/components/ui/button";

const DEFAULT_SHORTCUT_KEYS: KeyboardShortcutProps["keys"] = ["Mod", "Enter"];

/**
 * Submit button for an assistant composer: arrow, label and the submit
 * shortcut in one button, the way the Halo launcher carries its own.
 */
export function InAppAgentAskButton({
  disabled,
  onClick,
  shortcutKeys = DEFAULT_SHORTCUT_KEYS,
}: {
  disabled: boolean;
  onClick: () => void;
  /** The keys that submit in the composer this button belongs to. */
  shortcutKeys?: KeyboardShortcutProps["keys"];
}) {
  return (
    <Button
      type="button"
      aria-label="Ask"
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 gap-2"
    >
      <ArrowUp size="base" color="inherit" aria-hidden />
      <span>Ask</span>
      <span className="inline-flex">
        <KeyboardShortcut variant="subtle" keys={shortcutKeys} />
      </span>
    </Button>
  );
}
