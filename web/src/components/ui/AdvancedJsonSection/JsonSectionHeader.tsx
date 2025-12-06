/**
 * JsonSectionHeader - Self-contained header for AdvancedJsonSection
 *
 * A simplified version of MarkdownJsonViewHeader specifically for JSON sections.
 * Includes:
 * - Title with optional icon
 * - Copy button
 * - Custom control buttons (search, expand/collapse, etc.)
 */

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, Copy } from "lucide-react";

export interface JsonSectionHeaderProps {
  /** Section title (can be string or React node for custom rendering) */
  title: string | React.ReactNode;

  /** Optional icon to display next to title */
  titleIcon?: React.ReactNode;

  /** Callback when copy button is clicked */
  handleOnCopy: (event?: React.MouseEvent<HTMLButtonElement>) => void;

  /** Additional control buttons to render (search, expand/collapse, etc.) */
  controlButtons?: React.ReactNode;

  /** Background color for the header */
  backgroundColor?: string;
}

export function JsonSectionHeader({
  title,
  titleIcon,
  handleOnCopy,
  controlButtons,
  backgroundColor,
}: JsonSectionHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);

  return (
    <div
      className="io-message-header flex flex-row items-center justify-between px-1 py-1 text-sm font-medium capitalize transition-colors group-hover:bg-muted/80"
      style={{ backgroundColor }}
    >
      <div className="flex items-center gap-2">
        {titleIcon}
        {title}
      </div>
      <div className="mr-1 flex min-w-0 flex-shrink flex-row items-center gap-1">
        {controlButtons}
        <Button
          title="Copy to clipboard"
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={(event) => {
            setIsCopied(true);
            handleOnCopy(event);
            setTimeout(() => setIsCopied(false), 1000);
          }}
          className="-mr-2 hover:bg-border"
        >
          {isCopied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}
