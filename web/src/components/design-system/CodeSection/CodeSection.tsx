"use client";

import { cva } from "class-variance-authority";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy as CopyIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { IconButton } from "../IconButton/IconButton";
import { Tooltip } from "../Tooltip/Tooltip";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

const bodyVariants = cva("relative flex min-w-0 max-w-full items-start", {
  variants: {
    variant: {
      filled: "bg-surface-output rounded-md",
      outline: "bg-background rounded-md border",
      plain: null,
    },
  },
  defaultVariants: {
    variant: "filled",
  },
});

const codeVariants = cva(
  "ph-no-capture min-w-0 max-w-full flex-1 px-4 py-3 font-mono text-xs",
  {
    variants: {
      wrap: {
        true: "wrap-break-word whitespace-pre-wrap",
        false: "overflow-x-auto whitespace-pre",
      },
      collapsed: {
        true: "line-clamp-6",
        false: "block",
      },
    },
    defaultVariants: {
      wrap: true,
      collapsed: false,
    },
  },
);

const actionGroupVariants = cva(
  // Revealed on hover/focus only; touch devices have no hover, so the controls stay visible there.
  "relative flex shrink-0 items-center gap-1 opacity-0 group-hover/codesection:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
  {
    variants: {
      placement: {
        header: null,
        body: "pt-2 pr-2",
      },
    },
  },
);

type CodeSectionProps = {
  children: ReactNode;
  /** Omitted = no header row; actions move into the body's top-right corner. */
  title?: string;
  variant?: "filled" | "outline" | "plain";
  /** Extra controls rendered in the action group, before expand/collapse and copy. */
  actions?: ReactNode;
  /** Text copied by the built-in copy button; the button is hidden when omitted. */
  copyValue?: string;
  /** Shown next to the check icon after copying. */
  copiedMessage?: string;
  /** Clamps the body to six lines and adds an expand/collapse control. */
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
  shouldWrapLines?: boolean;
};

export function CodeSection({
  children,
  title,
  variant = "filled",
  actions,
  copyValue,
  copiedMessage,
  isCollapsible = false,
  defaultCollapsed = false,
  shouldWrapLines = true,
}: CodeSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(
    isCollapsible && defaultCollapsed,
  );
  const { copy, isCopied } = useCopyToClipboard({
    successDuration: copiedMessage ? 3_000 : 1_000,
  });

  const handleCopy = async () => {
    if (copyValue === undefined) return;
    try {
      await copy(copyValue);
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
    }
  };

  const hasActions =
    actions !== undefined || isCollapsible || copyValue !== undefined;

  const actionGroup = hasActions ? (
    <div
      className={actionGroupVariants({ placement: title ? "header" : "body" })}
    >
      {isCopied && copiedMessage ? (
        <span
          className="text-muted-foreground absolute top-0 right-full mr-1 flex h-full max-w-sm items-center truncate text-xs whitespace-nowrap"
          title={copiedMessage}
        >
          {copiedMessage}
        </span>
      ) : null}
      {actions}
      {isCollapsible ? (
        <Tooltip label={isCollapsed ? "Expand" : "Collapse"}>
          {({ getTriggerProps }) => (
            <IconButton
              {...getTriggerProps()}
              icon={isCollapsed ? ChevronsUpDown : ChevronsDownUp}
              label={isCollapsed ? "Expand" : "Collapse"}
              size="sm"
              variant="ghost"
              aria-expanded={!isCollapsed}
              onClick={() => setIsCollapsed((value) => !value)}
            />
          )}
        </Tooltip>
      ) : null}
      {copyValue !== undefined ? (
        <Tooltip label={isCopied ? "Copied" : "Copy"}>
          {({ getTriggerProps }) => (
            <IconButton
              {...getTriggerProps()}
              icon={isCopied ? Check : CopyIcon}
              label="Copy to clipboard"
              size="sm"
              variant="ghost"
              onClick={handleCopy}
            />
          )}
        </Tooltip>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="group/codesection flex max-w-full min-w-0 flex-col gap-1">
      {title ? (
        <div className="flex h-6 shrink-0 items-center justify-between gap-2">
          <div className="min-w-0 truncate text-sm font-bold" title={title}>
            {title}
          </div>
          {actionGroup}
        </div>
      ) : null}
      <div className={bodyVariants({ variant })}>
        <code
          className={codeVariants({
            wrap: shouldWrapLines,
            collapsed: isCollapsed,
          })}
          dir="auto"
          style={{ unicodeBidi: "plaintext" }}
        >
          {children}
        </code>
        {title ? null : actionGroup}
      </div>
    </div>
  );
}
