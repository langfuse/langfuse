"use client";

import { cva } from "class-variance-authority";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  type IconComponent,
} from "@langfuse/icons";
import { type ReactNode, useId, useState } from "react";

import { cn } from "@/src/utils/tailwind";
import { Button } from "../Button/Button";
import { CopyButton } from "../CopyButton/CopyButton";
import { CopyIconButton } from "../CopyIconButton/CopyIconButton";
import { IconButton } from "../IconButton/IconButton";
import { Tooltip } from "../Tooltip/Tooltip";

const bodyVariants = cva("relative flex min-w-0 max-w-full items-start", {
  variants: {
    variant: {
      filled: "bg-surface-section rounded-md",
      outline: "bg-background rounded-md border",
      plain: null,
    },
  },
  defaultVariants: {
    variant: "filled",
  },
});

const codeVariants = cva(
  "ph-no-capture min-w-0 max-w-full flex-1 px-4 pt-3 font-mono text-xs",
  {
    variants: {
      wrap: {
        true: "wrap-break-word whitespace-pre-wrap",
        false: "overflow-x-auto whitespace-pre",
      },
      clamp: {
        none: "block pb-3",
        six: "line-clamp-6 pb-3",
        preview:
          "line-clamp-3 [mask-image:linear-gradient(to_bottom,black_35%,transparent)]",
      },
    },
    defaultVariants: {
      wrap: true,
      clamp: "none",
    },
  },
);

const actionGroupVariants = cva(
  // Revealed on hover/focus only; touch devices have no hover, so the controls stay visible there. Copy feedback
  // keeps them shown after the pointer has left.
  "flex min-w-0 shrink-0 items-center gap-1 group-hover/codesection:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 has-[[data-copied]]:opacity-100",
  {
    variants: {
      placement: {
        header: null,
        body: "pt-2 pr-2",
      },
      isPinned: {
        true: "opacity-100",
        false: "opacity-0",
      },
    },
  },
);

/** Lets right-to-left lines read in their own direction inside the left-to-right block. */
const CODE_STYLE = { unicodeBidi: "plaintext" } as const;

type CodeSectionAction = {
  icon: IconComponent;
  label: string;
  onClick: () => void;
};

/** How the content is copied: the copy icon (optionally with a message after copying), or a labelled button. */
type CopyProps =
  | {
      /** Shown next to the check icon after copying, and read out instead of "Copied". */
      copiedMessage?: string;
      copyButton?: never;
    }
  | {
      /** A labelled copy button, e.g. "Copy prompt", in place of the copy icon; always visible. */
      copyButton: { text: string; variant: "primary" | "secondary" };
      copiedMessage?: never;
    };

/** How a long body is shortened: a six-line clamp toggled from the header, or a three-line preview opened below. */
type LengthProps =
  | {
      /** Clamps the body to six lines and adds an expand/collapse control. */
      isCollapsible?: boolean;
      defaultCollapsed?: boolean;
      expandLabel?: never;
    }
  | {
      /** Starts as a three-line preview that fades out, with a toggle below reading this label, e.g. "Show the full prompt". */
      expandLabel: string;
      isCollapsible?: never;
      defaultCollapsed?: never;
    };

type CodeSectionProps = {
  /** Text copied by the built-in copy control; also the body when there are no children. */
  content: string;
  /** Custom body, e.g. highlighted variables; copy still uses `content`. */
  children?: ReactNode;
  /** Omitted = no header row; actions move into the body's top-right corner. */
  title?: string;
  variant?: "filled" | "outline" | "plain";
  /** Extra icon actions rendered before expand/collapse and copy. */
  actions?: CodeSectionAction[];
  shouldWrapLines?: boolean;
  /** Runs after a copy lands, from the copy icon or the copy button. */
  onCopy?: () => void;
} & CopyProps &
  LengthProps;

function clampFor(isPreview: boolean, isCollapsed: boolean) {
  if (isPreview) return "preview";
  if (isCollapsed) return "six";
  return "none";
}

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
  onCopy,
  copyButton,
  expandLabel,
}: CodeSectionProps) {
  const codeId = useId();
  const [isCollapsed, setIsCollapsed] = useState(
    isCollapsible && defaultCollapsed,
  );
  const hasPreview = expandLabel !== undefined;
  const [isPreview, setIsPreview] = useState(hasPreview);

  const actionGroup = (
    <div
      className={actionGroupVariants({
        placement: title ? "header" : "body",
        isPinned: copyButton !== undefined,
      })}
    >
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
              aria-controls={codeId}
              aria-expanded={!isCollapsed}
              onClick={() => setIsCollapsed((value) => !value)}
            />
          )}
        </Tooltip>
      ) : null}
      {copyButton ? (
        <CopyButton
          text={copyButton.text}
          variant={copyButton.variant}
          size="sm"
          value={content}
          onCopy={onCopy}
        />
      ) : (
        <CopyIconButton
          label="Copy to clipboard"
          size="sm"
          value={content}
          copiedMessage={copiedMessage}
          onCopy={onCopy}
        />
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "group/codesection flex max-w-full min-w-0 flex-col",
        copyButton ? "gap-2" : "gap-1",
      )}
    >
      {title ? (
        <div className="flex min-h-6 shrink-0 items-center justify-between gap-2">
          <div className="min-w-0 truncate text-sm font-bold" title={title}>
            {title}
          </div>
          {actionGroup}
        </div>
      ) : null}
      <div className={bodyVariants({ variant })}>
        <code
          id={codeId}
          className={codeVariants({
            wrap: shouldWrapLines,
            clamp: clampFor(isPreview, isCollapsed),
          })}
          dir="auto"
          style={CODE_STYLE}
        >
          {children ?? content}
        </code>
        {title ? null : actionGroup}
      </div>
      {hasPreview ? (
        <div>
          <Button
            text={isPreview ? expandLabel : "Show less"}
            variant="text"
            size="sm"
            aria-controls={codeId}
            aria-expanded={!isPreview}
            onClick={() => setIsPreview((value) => !value)}
          />
        </div>
      ) : null}
    </div>
  );
}
