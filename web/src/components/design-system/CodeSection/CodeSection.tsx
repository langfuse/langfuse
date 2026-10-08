"use client";

import { cva } from "class-variance-authority";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy as CopyIcon,
  type LucideIcon,
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
  "flex min-w-0 shrink-0 items-center gap-1 group-hover/codesection:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
  {
    variants: {
      placement: {
        header: null,
        body: "pt-2 pr-2",
      },
      // Copy feedback stays visible even when the pointer has already left.
      isPinned: {
        true: "opacity-100",
        false: "opacity-0",
      },
    },
  },
);

type CodeSectionAction = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
};

type CodeSectionProps = {
  /** Text copied by the built-in copy button; also the body when there are no children. */
  content: string;
  /** Custom body, e.g. highlighted variables; copy still uses `content`. */
  children?: ReactNode;
  /** Omitted = no header row; actions move into the body's top-right corner. */
  title?: string;
  variant?: "filled" | "outline" | "plain";
  /** Extra icon actions rendered before expand/collapse and copy. */
  actions?: CodeSectionAction[];
  /** Shown next to the check icon after copying. */
  copiedMessage?: string;
  /** Clamps the body to six lines and adds an expand/collapse control. */
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
  shouldWrapLines?: boolean;
};

export function CodeSection({
  content,
  children,
  title,
  variant = "filled",
  actions = [],
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
    try {
      await copy(content);
    } catch {
      // Clipboard writes can be rejected when the browser denies permission.
    }
  };

  const actionGroup = (
    <div
      className={actionGroupVariants({
        placement: title ? "header" : "body",
        isPinned: isCopied,
      })}
    >
      {isCopied && copiedMessage ? (
        <span
          className="text-muted-foreground min-w-0 truncate text-xs"
          title={copiedMessage}
        >
          {copiedMessage}
        </span>
      ) : null}
      {actions.map((action) => (
        <Tooltip key={action.label} label={action.label}>
          {({ getTriggerProps }) => (
            <IconButton
              {...getTriggerProps()}
              icon={action.icon}
              label={action.label}
              size="sm"
              variant="ghost"
              onClick={action.onClick}
            />
          )}
        </Tooltip>
      ))}
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
    </div>
  );

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
          {children ?? content}
        </code>
        {title ? null : actionGroup}
      </div>
    </div>
  );
}
