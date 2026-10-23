"use client";

import { Check } from "@langfuse/icons";
import { Button } from "../Button/Button";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

/** How long "Copied" stays before the button reads as it did. */
const COPIED_MS = 1_400;

type CopyButtonProps = {
  /** The text put on the clipboard. */
  value: string;
  /** The action, e.g. "Copy prompt"; reads "Copied" for a moment after a copy. */
  text: string;
  variant: "primary" | "secondary" | "ghost";
  size: "default" | "sm";
  /** Runs after the copy lands: analytics, or moving a flow on. */
  onCopy?: () => void;
};

/** Copies a value and says so: the text turns to "Copied" with a check, and screen readers hear it once. */
export function CopyButton({
  value,
  text,
  variant,
  size,
  onCopy,
}: CopyButtonProps) {
  const { copy, isCopied } = useCopyToClipboard({
    successDuration: COPIED_MS,
  });
  const handleCopy = async () => {
    try {
      await copy(value);
      onCopy?.();
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
    }
  };

  return (
    <>
      <Button
        text={isCopied ? "Copied" : text}
        icon={isCopied ? Check : undefined}
        variant={variant}
        size={size}
        onClick={handleCopy}
      />
      <span role="status" className="sr-only">
        {isCopied ? "Copied" : ""}
      </span>
    </>
  );
}
