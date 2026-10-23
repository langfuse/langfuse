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
import { SyntaxHighlight } from "../SyntaxHighlight/SyntaxHighlight";
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
      // Keeps text clear of the floating body actions; unwrapped lines can scroll out from under them.
      reservedButtons: {
        0: null,
        1: "pr-10",
        2: "pr-17",
        3: "pr-24",
        4: "pr-31",
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
        // Floats over the code so long lines keep the full width.
        body: "absolute top-1.5 right-1.5 rounded-md",
      },
      surface: {
        filled: "bg-surface-section",
        outline: "bg-background",
        plain: "bg-background",
      },
      isPinned: {
        true: "opacity-100",
        false: "opacity-0",
      },
    },
    compoundVariants: [
      {
        // Invisible controls over the code must not swallow clicks on the text below.
        placement: "body",
        isPinned: false,
        class:
          "pointer-events-none group-hover/codesection:pointer-events-auto focus-within:pointer-events-auto pointer-coarse:pointer-events-auto",
      },
    ],
  },
);

/** Lets right-to-left lines read in their own direction inside the left-to-right block. */
const CODE_STYLE = { unicodeBidi: "plaintext" } as const;

type CodeSectionAction = {
  /** Stable React key; set it when `label` changes so focus survives the change. */
  id?: string;
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
      /** A labelled copy button, e.g. "Copy prompt", in place of the copy icon; always visible, so it sits in the header. */
      copyButton: { text: string; variant: "primary" | "secondary" };
      title: string;
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
  /** Prism language name, e.g. `sh` or `json`, to syntax-highlight `content`. Ignored when `children` is set. */
  language?: string;
  /** Omitted = no header row; actions move into the body's top-right corner. */
  title?: string;
  variant?: "filled" | "outline" | "plain";
  /** Extra icon actions rendered before expand/collapse and copy. */
  actions?: CodeSectionAction[];
  shouldWrapLines?: boolean;
  /** Called after the built-in copy control wrote `content` to the clipboard. */
  onAfterCopy?: () => void;
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
  language,
  title,
  variant = "filled",
  actions = [],
  copiedMessage,
  onAfterCopy,
  isCollapsible = false,
  defaultCollapsed = false,
  shouldWrapLines = true,
  copyButton,
  expandLabel,
}: CodeSectionProps) {
  const codeId = useId();
  const [isCollapsed, setIsCollapsed] = useState(
    isCollapsible && defaultCollapsed,
  );
  const hasPreview = expandLabel !== undefined;
  const [isPreview, setIsPreview] = useState(hasPreview);

  const bodyButtonCount = Math.min(
    actions.length + (isCollapsible ? 1 : 0) + 1,
    4,
  ) as 1 | 2 | 3 | 4;

  const actionGroup = (
    <div
      className={actionGroupVariants({
        placement: title ? "header" : "body",
        surface: title ? undefined : variant,
        isPinned: copyButton !== undefined,
      })}
    >
      {actions.map((action) => (
        <Tooltip key={action.id ?? action.label} label={action.label}>
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
          onAfterCopy={onAfterCopy}
        />
      ) : (
        <CopyIconButton
          label="Copy to clipboard"
          size="sm"
          value={content}
          copiedMessage={copiedMessage}
          onAfterCopy={onAfterCopy}
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
            reservedButtons: title ? 0 : bodyButtonCount,
          })}
          dir="auto"
          style={CODE_STYLE}
        >
          {children ??
            (language === undefined ? (
              content
            ) : (
              <SyntaxHighlight code={content} language={language}>
                {({ content: highlighted }) => highlighted}
              </SyntaxHighlight>
            ))}
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
