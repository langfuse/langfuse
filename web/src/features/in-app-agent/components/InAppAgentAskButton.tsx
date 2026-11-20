import { Command, CornerDownLeft } from "@langfuse/icons";

import {
  KeyboardShortcut,
  type KeyboardKey,
  type KeyboardShortcutProps,
} from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Button } from "@/src/components/ui/button";
import { useIsMac } from "@/src/hooks/useIsMac";

const DEFAULT_SHORTCUT_KEYS: KeyboardShortcutProps["keys"] = ["Mod", "Enter"];

/** Command and Enter draw as icons so both keys share one size and baseline. */
function ShortcutKey({
  shortcutKey,
  isMac,
}: {
  shortcutKey: KeyboardKey;
  isMac: boolean;
}) {
  if (shortcutKey === "Enter") {
    return <CornerDownLeft size="sm" color="inherit" aria-hidden />;
  }
  if (shortcutKey === "Mod" && isMac) {
    return <Command size="sm" color="inherit" aria-hidden />;
  }
  return <KeyboardShortcut variant="subtle" keys={[shortcutKey]} />;
}

/**
 * Submit button for an assistant composer: label and the submit shortcut in
 * one button, the way the Halo launcher carries its own.
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
  const isMac = useIsMac();

  return (
    <Button
      type="button"
      aria-label="Ask"
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 gap-2"
    >
      <span>Ask</span>
      <span className="text-foreground-tertiary inline-flex items-center gap-0.5">
        {shortcutKeys.map((shortcutKey) => (
          <ShortcutKey
            key={shortcutKey}
            shortcutKey={shortcutKey}
            isMac={isMac}
          />
        ))}
      </span>
    </Button>
  );
}
