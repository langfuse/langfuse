"use client";

import { Check, Copy } from "@langfuse/icons";
import { IconButton } from "../IconButton/IconButton";
import { Tooltip } from "../Tooltip/Tooltip";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

/** How long the check stays before the icon reads as it did. */
const COPIED_MS = 1_400;
/** A written message stays long enough to read. */
const MESSAGE_MS = 3_000;

type CopyIconButtonProps = {
  /** The text put on the clipboard. */
  value: string;
  /** What gets copied, e.g. "Copy LANGFUSE_PUBLIC_KEY"; also the tooltip. */
  label: string;
  size: "xs" | "sm" | "md";
  /** Runs after the copy lands: analytics, or moving a flow on. */
  onCopy?: () => void;
  /** Shown beside the icon after a copy, and said in place of "Copied", e.g. what the copy left out. */
  copiedMessage?: string;
};

/**
 * Copies a value from an icon: the icon turns to a check and screen readers hear "Copied" once. While copied, its
 * wrapper carries `data-copied`, so a hover-revealed toolbar can stay shown.
 */
export function CopyIconButton({
  value,
  label,
  size,
  onCopy,
  copiedMessage,
}: CopyIconButtonProps) {
  const { copy, isCopied } = useCopyToClipboard({
    successDuration: copiedMessage ? MESSAGE_MS : COPIED_MS,
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
    <span
      className="inline-flex min-w-0 items-center gap-1"
      data-copied={isCopied || undefined}
    >
      {isCopied && copiedMessage ? (
        <span
          aria-hidden
          className="text-muted-foreground min-w-0 truncate text-xs"
          title={copiedMessage}
        >
          {copiedMessage}
        </span>
      ) : null}
      <Tooltip label={label}>
        {({ getTriggerProps }) => (
          <IconButton
            {...getTriggerProps()}
            icon={isCopied ? Check : Copy}
            label={label}
            size={size}
            variant="ghost"
            onClick={handleCopy}
          />
        )}
      </Tooltip>
      <span role="status" className="sr-only">
        {isCopied ? (copiedMessage ?? "Copied") : ""}
      </span>
    </span>
  );
}
