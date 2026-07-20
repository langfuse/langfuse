"use client";
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  CircleX,
  Copy,
  BookOpenText,
  Loader2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Streamdown } from "streamdown";
import { Button } from "@/src/components/ui/button";
import { getSafeLinkUrl } from "@/src/components/ui/safe-url";
import { stripBasePath } from "@/src/utils/redirect";
import { cn } from "@/src/utils/tailwind";
import {
  forwardRef,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  type InAppAgentMessageFeedback,
  type InAppAgentMessageFeedbackValue,
  type InAppAgentMessageSource,
} from "@/src/ee/features/in-app-agent/schema";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useElementSize } from "@/src/hooks/useElementSize";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  expandMarkdownSelection,
  getMarkdownSourceRangeFromRenderedOffsets,
  projectMarkdownToRenderedText,
} from "./utils/markdown";
import styles from "./InAppAgentMessage.module.css";
import { InAppAgentToolPayload } from "./InAppAgentToolPayload";
import { InAppAgentToolResultPayload } from "./InAppAgentToolResultPayload";
import { type InAppAgentToolCallContent } from "@/src/ee/features/in-app-agent/components/utils/utils";

export type InAppAgentMessageRole = "assistant" | "user";

type InAppAgentRedirectActionContent = {
  type: "redirectAction";
  label: string;
  href: string;
};

export type InAppAgentMessageContent =
  | { type: "loading"; label?: string }
  | { type: "reasoning"; text: string; isStreaming: boolean }
  | {
      type: "text";
      text: string;
      feedback?: InAppAgentMessageFeedback;
      redirectAction?: InAppAgentRedirectActionContent;
      sources?: InAppAgentMessageSource[];
    }
  | InAppAgentRedirectActionContent
  | {
      type: "toolGroup";
      tools: InAppAgentToolCallContent[];
      isLoading?: boolean;
    };

const parseAbsoluteUrl = (href: string): URL | null => {
  try {
    return new URL(href);
  } catch {
    return null;
  }
};

// Uses client-side navigation for links within the current project
// and opens all other links in a new tab.
function SmartLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const safeHref = getSafeLinkUrl(href);
  const currentProjectId = useProjectIdFromURL();

  if (!safeHref) {
    return <span className="text-muted-foreground underline">{children}</span>;
  }

  try {
    const currentOrigin =
      typeof window === "undefined" ? null : window.location.origin;
    const absoluteUrl = parseAbsoluteUrl(safeHref);
    const parsedUrl = absoluteUrl ?? new URL(safeHref, currentOrigin ?? "");
    const pathname = stripBasePath(parsedUrl.pathname);
    const [, projectSegment, linkProjectId] = pathname.split("/");

    if (
      currentProjectId &&
      projectSegment === "project" &&
      decodeURIComponent(linkProjectId ?? "") === currentProjectId &&
      (!absoluteUrl ||
        ((parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
          currentOrigin &&
          parsedUrl.origin === currentOrigin))
    ) {
      return (
        <Link
          href={`${pathname}${parsedUrl.search}${parsedUrl.hash}`}
          className={className}
        >
          {children}
        </Link>
      );
    }
  } catch {
    // Fall through to opening sanitized but non-routable URLs in a new tab.
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}

export type InAppAgentMessageProps = {
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
  isCompact?: boolean;
  isFeedbackDisabled?: boolean;
  onSubmitFeedback?: (params: {
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
};

export function InAppAgentMessage({
  role,
  content,
  isCompact = false,
  isFeedbackDisabled = false,
  onSubmitFeedback,
}: InAppAgentMessageProps) {
  if (content.type === "redirectAction") {
    return <RedirectActionButton content={content} isCompact={isCompact} />;
  }

  if (content.type === "toolGroup") {
    return (
      <ToolCallGroup
        tools={content.tools}
        isLoading={content.isLoading}
        isCompact={isCompact}
      />
    );
  }

  if (content.type === "reasoning") {
    return <InAppAgentReasoningBlock content={content} isCompact={isCompact} />;
  }

  if (content.type === "text" && role === "assistant") {
    return (
      <AssistantMessageWithFeedback
        content={content}
        isCompact={isCompact}
        isFeedbackDisabled={isFeedbackDisabled}
        onSubmitFeedback={onSubmitFeedback}
      />
    );
  }

  return <MessageCard role={role} content={content} isCompact={isCompact} />;
}

const MessageCard = forwardRef<
  HTMLDivElement,
  {
    role: InAppAgentMessageRole;
    content: Exclude<
      InAppAgentMessageContent,
      { type: "toolGroup" | "redirectAction" | "reasoning" }
    >;
    isCompact: boolean;
  }
>(function MessageCard({ role, content, isCompact }, ref) {
  const isUser = role === "user";

  return (
    <div
      ref={ref}
      className={cn(
        "max-w-full overflow-hidden wrap-break-word shadow-xs",
        isCompact
          ? "rounded-xl px-2.5 py-1 text-[0.775rem]"
          : "rounded-2xl px-3 py-1.5 text-sm",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-card text-foreground border-border border",
      )}
    >
      {content.type === "loading" ? (
        <ThinkingIndicator label={content.label} isCompact={isCompact} />
      ) : (
        <>
          <MessageText role={role} text={content.text} isCompact={isCompact} />
          {content.redirectAction ? (
            <div className={cn(isCompact ? "mt-3 mb-1" : "mt-2.5 mb-0.5")}>
              <RedirectActionButton
                content={content.redirectAction}
                isCompact={isCompact}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});

function AssistantMessageWithFeedback({
  content,
  isCompact,
  isFeedbackDisabled,
  onSubmitFeedback,
}: {
  content: Extract<InAppAgentMessageContent, { type: "text" }>;
  isCompact: boolean;
  isFeedbackDisabled: boolean;
  onSubmitFeedback?: (params: {
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
}) {
  const [messageCardRef, messageCardSize] = useElementSize<HTMLDivElement>();
  const sources = content.sources ?? [];
  const hasSources = sources.length > 0;
  const hasActions = Boolean(onSubmitFeedback || hasSources);

  return (
    <div className="flex max-w-full flex-col items-start">
      <MessageCard
        ref={messageCardRef}
        role="assistant"
        content={content}
        isCompact={isCompact}
      />
      {hasActions ? (
        <div
          style={
            messageCardSize?.width
              ? { width: messageCardSize.width, maxWidth: "100%" }
              : undefined
          }
          className={cn(
            "flex max-w-full min-w-50 flex-col items-start overflow-hidden",
            isCompact ? "mt-1.5" : "mt-2",
          )}
        >
          <div className="flex w-full min-w-0 items-center gap-1">
            {onSubmitFeedback ? (
              <MessageFeedbackControls
                feedback={content.feedback}
                isCompact={isCompact}
                isFeedbackDisabled={isFeedbackDisabled}
                onSubmitFeedback={onSubmitFeedback}
              />
            ) : null}
            {hasSources ? (
              <SourcesPopover sources={sources} isCompact={isCompact} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InAppAgentReasoningBlock({
  content,
  isCompact,
}: {
  content: Extract<InAppAgentMessageContent, { type: "reasoning" }>;
  isCompact: boolean;
}) {
  // null until the user toggles manually; until then the disclosure follows
  // the streaming state (open while streaming, collapsed when done).
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const isOpen = userToggled ?? content.isStreaming;

  return (
    <details
      open={isOpen}
      onToggle={(event) => {
        // The browser also fires toggle when React flips `open` at stream
        // start/end; only record toggles that diverge from the current state.
        if (event.currentTarget.open !== isOpen) {
          setUserToggled(event.currentTarget.open);
        }
      }}
      className={cn(
        "text-muted-foreground max-w-full",
        isCompact ? "text-[0.775rem]" : "text-sm",
      )}
    >
      <summary
        className={cn(
          "hover:text-foreground focus-visible:ring-ring flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-xs leading-none font-bold outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden",
          isCompact && "px-0.5",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1",
            content.isStreaming && styles.thinkingShimmer,
          )}
        >
          {content.isStreaming ? "Thinking" : "Thought"}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            !isOpen && "-rotate-90",
          )}
        />
      </summary>
      {isOpen ? (
        // The block grows with its content instead of scrolling internally;
        // the drawer's auto-follow keeps the newest text visible while
        // streaming, and the block collapses when streaming ends.
        <div
          aria-label="Assistant reasoning"
          data-testid="in-app-agent-reasoning-content"
          className={cn(
            // Vertical spacing is margin, not padding, so the left border
            // hugs the text instead of extending past it.
            "border-border/70 mt-2 mb-1 border-l px-3 leading-5 wrap-break-word whitespace-pre-wrap",
            isCompact && "px-2.5 leading-4",
          )}
        >
          {content.text || "Thinking..."}
        </div>
      ) : null}
    </details>
  );
}

function MessageFeedbackControls({
  feedback,
  isCompact,
  isFeedbackDisabled,
  onSubmitFeedback,
}: {
  feedback?: InAppAgentMessageFeedback;
  isCompact: boolean;
  isFeedbackDisabled: boolean;
  onSubmitFeedback: (params: {
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
}) {
  const [committedComment, setCommittedComment] = useState(
    feedback?.comment?.trim() ?? "",
  );
  const [comment, setComment] = useState(feedback?.comment ?? "");
  const [selectedValue, setSelectedValue] = useState(feedback?.value);
  const [isCommentPopoverOpen, setIsCommentPopoverOpen] = useState(false);
  const isFeedbackDisabledRef = useRef(isFeedbackDisabled);
  isFeedbackDisabledRef.current = isFeedbackDisabled;

  const [submitFeedback, isSubmittingFeedback] = useWatchedPromiseCallback(
    async (
      value: InAppAgentMessageFeedbackValue | null,
      nextComment: string = committedComment,
    ) => {
      await onSubmitFeedback({
        value,
        comment: nextComment.trim() || null,
      });
    },
    [committedComment, onSubmitFeedback],
  );

  const [submitComment, isSubmittingComment] =
    useWatchedPromiseCallback(async () => {
      if (!selectedValue) {
        return;
      }

      await onSubmitFeedback({
        value: selectedValue,
        comment: comment.trim() || null,
      });
      setCommittedComment(comment.trim());
      setIsCommentPopoverOpen(false);
    }, [comment, onSubmitFeedback, selectedValue]);

  const isSaving = isSubmittingFeedback || isSubmittingComment;
  const isDisabled = isFeedbackDisabled || isSaving;

  const handleSubmitComment = async () => {
    if (!selectedValue) {
      return;
    }

    await submitComment().catch(() => undefined);
  };

  const handleSelectFeedback = (value: InAppAgentMessageFeedbackValue) => {
    if (selectedValue === value) {
      submitFeedback(null, "")
        .then(() => {
          setSelectedValue(undefined);
          setComment("");
          setCommittedComment("");
          setIsCommentPopoverOpen(false);
        })
        .catch(() => undefined);
      return;
    }

    submitFeedback(value, "")
      .then(() => {
        setSelectedValue(value);
        setComment("");
        setCommittedComment("");
        setIsCommentPopoverOpen(!isFeedbackDisabledRef.current);
      })
      .catch(() => undefined);
  };

  const commentButtonText = `Comment: ${committedComment}`;

  return (
    <Popover
      open={!isFeedbackDisabled && isCommentPopoverOpen}
      onOpenChange={(open) => {
        if (!isFeedbackDisabled) {
          setIsCommentPopoverOpen(open);
        }
      }}
    >
      <PopoverAnchor className="inline-flex">
        <FeedbackButton
          label="Good response"
          isSelected={selectedValue === "thumbs_up"}
          disabled={isDisabled}
          onClick={() => {
            handleSelectFeedback("thumbs_up");
          }}
        >
          <ThumbsUp
            className={cn(
              isCompact ? "size-3" : "size-3.5",
              selectedValue === "thumbs_up" && "text-foreground",
            )}
          />
        </FeedbackButton>
      </PopoverAnchor>
      <FeedbackButton
        label="Bad response"
        isSelected={selectedValue === "thumbs_down"}
        disabled={isDisabled}
        onClick={() => {
          handleSelectFeedback("thumbs_down");
        }}
      >
        <ThumbsDown
          className={cn(
            isCompact ? "size-3" : "size-3.5",
            selectedValue === "thumbs_down" && "text-foreground",
          )}
        />
      </FeedbackButton>
      {committedComment ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ml-1 min-w-0 flex-1 truncate text-left text-xs disabled:cursor-not-allowed disabled:opacity-60"
          title={commentButtonText}
          disabled={isDisabled}
          onClick={() => {
            setIsCommentPopoverOpen(true);
          }}
        >
          {commentButtonText}
        </button>
      ) : null}
      {selectedValue ? (
        <PopoverContent
          align="start"
          side="top"
          className="w-72 space-y-1.5 p-2"
        >
          <div>
            <textarea
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
              disabled={isDisabled}
              placeholder="Optional feedback comment"
              rows={3}
              maxLength={500}
              className={cn(
                "border-input bg-background text-foreground placeholder:text-foreground-tertiary w-full resize-none rounded-md border px-2 py-1",
                isCompact ? "text-xs" : "text-sm",
              )}
            />
            <CommentButton
              disabled={isDisabled}
              className={cn(!isCompact && "px-2 py-1.5 text-sm")}
              onClick={() => {
                handleSubmitComment().catch(() => undefined);
              }}
            >
              {isSubmittingComment ? "Saving..." : "Save comment"}
            </CommentButton>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function SourcesPopover({
  sources,
  isCompact,
}: {
  sources: InAppAgentMessageSource[];
  isCompact: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground/70 hover:text-muted-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold",
            isCompact && "py-0.5",
          )}
        >
          <BookOpenText className={cn(isCompact ? "size-3" : "size-3.5")} />
          Sources
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-1.5">
        <div className="space-y-0.5">
          {sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-muted flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 no-underline"
            >
              <span
                aria-hidden="true"
                className="bg-muted size-3.5 shrink-0 rounded-sm bg-cover bg-center"
                style={{ backgroundImage: `url("${source.faviconUrl}")` }}
              />
              <span
                className="text-foreground min-w-0 flex-1 truncate text-xs"
                title={source.title}
              >
                {source.title}
              </span>
            </a>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const CommentButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function CommentButton({ children, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

function FeedbackButton({
  children,
  disabled,
  isSelected,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isSelected}
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground/50 hover:text-muted-foreground rounded-md p-1 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function RedirectActionButton({
  content,
  isCompact,
}: {
  content: InAppAgentRedirectActionContent;
  isCompact: boolean;
}) {
  const router = useRouter();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("shrink-0", isCompact ? "h-6 px-2 text-xs" : "h-7")}
      onClick={() => {
        router.push(content.href).catch(() => undefined);
      }}
    >
      {content.label}
      <ArrowRight className="ml-1 size-3" />
    </Button>
  );
}

function ToolCallGroup({
  tools,
  isLoading = false,
  isCompact = false,
}: {
  tools: InAppAgentToolCallContent[];
  isLoading?: boolean;
  isCompact?: boolean;
}) {
  const label = `${isLoading ? "Calling" : "Called"} ${tools.length} ${
    tools.length === 1 ? "tool" : "tools"
  }`;
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const isOpen = userToggled ?? isLoading;

  return (
    <details
      open={isOpen}
      onToggle={(event) => {
        if (event.currentTarget.open !== isOpen) {
          setUserToggled(event.currentTarget.open);
        }
      }}
      className={cn(
        "text-muted-foreground max-w-full",
        isCompact ? "text-[0.775rem]" : "text-sm",
      )}
    >
      <summary className="hover:text-foreground focus-visible:ring-ring flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-xs leading-4 font-bold outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span className={cn(isLoading && styles.thinkingShimmer)}>{label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            !isOpen && "-rotate-90",
          )}
        />
      </summary>
      <div className="mt-0.5 flex flex-col gap-0">
        {tools.map((tool, index) => (
          <ToolCallDisclosure
            key={`${tool.name}-${index}`}
            tool={tool}
            isCompact={isCompact}
          />
        ))}
      </div>
    </details>
  );
}

function ToolCallDisclosure({
  tool,
  isCompact,
}: {
  tool: InAppAgentToolCallContent;
  isCompact: boolean;
}) {
  const status = tool.status;

  return (
    <details className="group/tool min-w-0">
      <summary
        aria-label={`${tool.name}: ${status}`}
        className={cn(
          "hover:text-foreground focus-visible:ring-ring flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-xs leading-4 font-bold outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden",
          isCompact && "px-0.5",
        )}
      >
        <ToolCallStatusIcon status={status} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate py-0.5",
            status === "failed" && "text-destructive",
            status === "denied" && "text-dark-yellow",
          )}
          title={tool.name}
        >
          {tool.name}
        </span>
      </summary>
      <div className={cn("mt-1.5 mb-1 ml-3 px-3", isCompact && "px-2.5")}>
        <div className="flex flex-col gap-2">
          <InAppAgentToolPayload
            label="Arguments"
            value={tool.args}
            variant="default"
          />
          <InAppAgentToolResultPayload tool={tool} />
        </div>
      </div>
    </details>
  );
}

function ToolCallStatusIcon({
  status,
}: {
  status: InAppAgentToolCallContent["status"];
}) {
  if (status === "running") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin" />;
  }

  if (status === "succeeded") {
    return <Check className="text-dark-green size-3.5 shrink-0" />;
  }

  if (status === "failed") {
    return <CircleX className="text-destructive size-3.5 shrink-0" />;
  }

  return <Ban className="text-dark-yellow size-3.5 shrink-0" />;
}

function MessageText({
  role,
  text,
  isCompact,
}: {
  role: InAppAgentMessageRole;
  text: string;
  isCompact: boolean;
}) {
  if (role === "user") {
    return (
      <p
        className={cn(
          "whitespace-pre-wrap",
          isCompact ? "leading-4" : "leading-4.5",
        )}
      >
        {text}
      </p>
    );
  }

  return (
    <div
      data-compact={isCompact}
      onCopy={(event) => {
        const browserSelection =
          event.currentTarget.ownerDocument.getSelection();

        const result = getSelectedMarkdownFromSource(
          event.currentTarget,
          browserSelection,
          text,
        );

        if (!result) {
          return;
        }

        event.preventDefault();
        event.clipboardData.setData("text/plain", result.markdown);
        event.clipboardData.setData("text/html", result.html);
      }}
      className={cn(styles.Streamdown, isCompact && styles.compact)}
    >
      <Streamdown
        // Remove all default classNames so that tailwind's prose styling can be applied without conflicts
        components={{
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h4>{children}</h4>,
          h5: ({ children }) => <h5>{children}</h5>,
          h6: ({ children }) => <h6>{children}</h6>,

          p: ({ children }) => <p>{children}</p>,
          a: ({ children, href }) => (
            <SmartLink href={href}>{children}</SmartLink>
          ),
          hr: ({ children }) => <hr>{children}</hr>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          b: ({ children }) => <b>{children}</b>,
          strong: ({ children }) => <strong>{children}</strong>,
          i: ({ children }) => <i>{children}</i>,
          em: ({ children }) => <em>{children}</em>,
          code: ({ children }) => <code>{children}</code>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Streamdown>
    </div>
  );
}

function getSelectedMarkdownFromSource(
  root: HTMLElement,
  selection: Selection | null,
  markdown: string,
): { markdown: string; html: string } | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (
    !(range.startContainer === root || root.contains(range.startContainer)) ||
    !(range.endContainer === root || root.contains(range.endContainer))
  ) {
    return null;
  }

  const selectedText = selection.toString();
  if (!selectedText.trim()) {
    return null;
  }

  const projection = projectMarkdownToRenderedText(markdown);

  const renderedStart = (() => {
    const prefixRange = root.ownerDocument.createRange();
    prefixRange.selectNodeContents(root);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    return prefixRange.toString().length;
  })();

  const renderedEnd = (() => {
    const prefixRange = root.ownerDocument.createRange();
    prefixRange.selectNodeContents(root);
    prefixRange.setEnd(range.endContainer, range.endOffset);
    return prefixRange.toString().length;
  })();

  const fallbackStart = projection.plain.indexOf(selectedText, renderedStart);
  const exactTextSelection =
    fallbackStart === -1
      ? null
      : getMarkdownSourceRangeFromRenderedOffsets(
          projection,
          fallbackStart,
          fallbackStart + selectedText.length,
        );
  const offsetSelection = getMarkdownSourceRangeFromRenderedOffsets(
    projection,
    renderedStart,
    renderedEnd,
  );

  const sourceRange = exactTextSelection ?? offsetSelection;

  if (!sourceRange) {
    return null;
  }

  const { start, end } = expandMarkdownSelection(
    markdown,
    sourceRange.start,
    sourceRange.end,
  );
  const selectedMarkdown = trimTrailingFenceNewline(markdown, start, end);

  const htmlContainer = root.ownerDocument.createElement("div");
  htmlContainer.append(range.cloneContents());
  htmlContainer
    .querySelectorAll("[data-in-app-agent-code-copy-button]")
    .forEach((node) => {
      node.remove();
    });

  return {
    markdown: selectedMarkdown,
    html: htmlContainer.innerHTML,
  };
}

function trimTrailingFenceNewline(
  markdown: string,
  start: number,
  end: number,
) {
  const selectedMarkdown = markdown.slice(start, end);

  if (
    !selectedMarkdown.endsWith("\n") ||
    !markdown.slice(end).startsWith("```")
  ) {
    return selectedMarkdown;
  }

  const openingFenceIndex = markdown.lastIndexOf("```", start);
  if (openingFenceIndex === -1) {
    return selectedMarkdown;
  }

  const previousClosingFenceIndex = markdown.lastIndexOf("\n```", start);
  if (previousClosingFenceIndex > openingFenceIndex) {
    return selectedMarkdown;
  }

  return selectedMarkdown.slice(0, -1);
}

function CodeBlock({ children }: { children: ReactNode }) {
  const { copy, isCopied } = useCopyToClipboard({ successDuration: 1_500 });

  // This is ugly but streamdown doesn't provide an easy way to get the raw text content of a code block
  const code = useMemo(
    () =>
      typeof children === "object" &&
      children &&
      "props" in children &&
      typeof children.props === "object" &&
      children.props &&
      "children" in children.props &&
      typeof children.props.children === "string"
        ? children.props.children
        : "",
    [children],
  );

  return (
    <pre className="group/code-block relative pr-10">
      <button
        type="button"
        data-in-app-agent-code-copy-button="true"
        aria-label={isCopied ? "Copied code" : "Copy code"}
        title={isCopied ? "Copied" : "Copy code"}
        contentEditable={false}
        disabled={!code}
        onClick={() => {
          copy(code).catch(() => undefined);
        }}
        className="bg-background/90 text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1.5 right-1.5 z-10 inline-flex size-6 items-center justify-center rounded-md border opacity-80 shadow-sm transition select-none hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isCopied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      {children}
    </pre>
  );
}

function ThinkingIndicator({
  className,
  label = "Thinking...",
  isCompact = false,
}: {
  className?: string;
  label?: string;
  isCompact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center",
        isCompact ? "gap-1.5 text-[0.775rem]" : "gap-2 text-sm",
        className,
      )}
    >
      <Loader2
        className={cn("animate-spin", isCompact ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
      <span>{label}</span>
    </div>
  );
}
