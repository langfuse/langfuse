"use client";

import {
  Check,
  Copy,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { getSafeLinkUrl } from "@/src/components/ui/safe-url";
import { cn } from "@/src/utils/tailwind";
import {
  forwardRef,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import type {
  InAppAgentMessageFeedback,
  InAppAgentMessageFeedbackValue,
} from "@/src/ee/features/in-app-agent/schema";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/src/components/ui/popover";
import { useElementSize } from "@/src/hooks/useElementSize";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";

export type InAppAgentMessageRole = "assistant" | "user";

export type InAppAgentMessageContent =
  | { type: "loading"; label?: string }
  | { type: "text"; text: string; feedback?: InAppAgentMessageFeedback }
  | {
      type: "toolGroup";
      tools: InAppAgentToolCallContent[];
      isLoading?: boolean;
    };

export type InAppAgentToolCallContent = {
  type: "tool";
  name: string;
  args: string;
  result?: string;
  error?: string;
};

export type InAppAgentMessageProps = {
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
  isCompact?: boolean;
  isFeedbackDisabled?: boolean;
  windowZIndex?: number;
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
  windowZIndex,
  onSubmitFeedback,
}: InAppAgentMessageProps) {
  if (content.type === "toolGroup") {
    return (
      <div
        className={cn(
          "bg-card dark:bg-header text-foreground border-border rounded-2xl border py-2 shadow-xs",
          isCompact
            ? "rounded-xl py-1 text-[0.775rem]"
            : "rounded-2xl py-1.5 text-sm",
        )}
      >
        <ToolCallGroup
          tools={content.tools}
          isLoading={content.isLoading}
          isCompact={isCompact}
        />
      </div>
    );
  }

  if (content.type === "text" && role === "assistant" && onSubmitFeedback) {
    return (
      <AssistantMessageWithFeedback
        content={content}
        isCompact={isCompact}
        isFeedbackDisabled={isFeedbackDisabled}
        windowZIndex={windowZIndex}
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
    content: Exclude<InAppAgentMessageContent, { type: "toolGroup" }>;
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
          : "bg-card dark:bg-header text-foreground border-border border",
      )}
    >
      {content.type === "loading" ? (
        <ThinkingIndicator label={content.label} isCompact={isCompact} />
      ) : (
        <MessageText role={role} text={content.text} isCompact={isCompact} />
      )}
    </div>
  );
});

function AssistantMessageWithFeedback({
  content,
  isCompact,
  isFeedbackDisabled,
  windowZIndex,
  onSubmitFeedback,
}: {
  content: Extract<InAppAgentMessageContent, { type: "text" }>;
  isCompact: boolean;
  isFeedbackDisabled: boolean;
  windowZIndex?: number;
  onSubmitFeedback: (params: {
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
}) {
  const [messageCardRef, messageCardSize] = useElementSize<HTMLDivElement>();

  return (
    <div className="flex max-w-full flex-col items-start">
      <MessageCard
        ref={messageCardRef}
        role="assistant"
        content={content}
        isCompact={isCompact}
      />
      <MessageFeedbackControls
        feedback={content.feedback}
        isCompact={isCompact}
        isFeedbackDisabled={isFeedbackDisabled}
        windowZIndex={windowZIndex}
        maxWidth={messageCardSize?.width}
        onSubmitFeedback={onSubmitFeedback}
      />
    </div>
  );
}

function MessageFeedbackControls({
  feedback,
  isCompact,
  isFeedbackDisabled,
  windowZIndex,
  maxWidth,
  onSubmitFeedback,
}: {
  feedback?: InAppAgentMessageFeedback;
  isCompact: boolean;
  isFeedbackDisabled: boolean;
  windowZIndex?: number;
  maxWidth?: number;
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

  return (
    <div
      style={maxWidth ? { width: maxWidth, maxWidth: "100%" } : undefined}
      className={cn(
        "flex max-w-full min-w-50 flex-col items-start overflow-hidden",
        isCompact ? "mt-1.5" : "mt-2",
      )}
    >
      <Popover
        open={!isFeedbackDisabled && isCommentPopoverOpen}
        onOpenChange={(open) => {
          if (!isFeedbackDisabled) {
            setIsCommentPopoverOpen(open);
          }
        }}
      >
        <div className="flex w-full min-w-0 items-center gap-1">
          <PopoverAnchor className="inline-flex">
            <FeedbackButton
              label="Good response"
              isSelected={selectedValue === "thumbs_up"}
              disabled={isDisabled}
              onClick={() => handleSelectFeedback("thumbs_up")}
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
            onClick={() => handleSelectFeedback("thumbs_down")}
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
              disabled={isDisabled}
              onClick={() => setIsCommentPopoverOpen(true)}
            >
              Comment: {committedComment}
            </button>
          ) : null}
        </div>
        {selectedValue ? (
          <PopoverContent
            align="start"
            side="top"
            className="w-72 space-y-1.5 p-2"
            style={
              typeof windowZIndex === "number"
                ? { zIndex: windowZIndex + 1 }
                : undefined
            }
          >
            <div>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={isDisabled}
                placeholder="Optional feedback comment"
                rows={3}
                maxLength={500}
                className={cn(
                  "border-input bg-background text-foreground placeholder:text-muted-foreground w-full resize-none rounded-md border px-2 py-1",
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
    </div>
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
        "text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60",
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
      className={cn(
        "text-muted-foreground/50 hover:text-muted-foreground rounded-md p-1 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
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
  const label = `${isLoading ? "Calling" : "Called"} ${tools.length} ${tools.length === 1 ? "tool" : "tools"}`;

  const paddingX = cn(isCompact ? "px-2.5" : "px-3");
  const iconSize = isCompact ? "size-3" : "size-4";

  return (
    <details className="group/tool-group min-w-0">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 text-xs leading-none font-medium [&::-webkit-details-marker]:hidden",
          paddingX,
        )}
      >
        {isLoading ? (
          <Loader2
            className={cn(
              "text-muted-foreground shrink-0 animate-spin",
              iconSize,
            )}
          />
        ) : (
          <Wrench className={cn("text-muted-foreground shrink-0", iconSize)} />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-muted-foreground text-xs group-open/tool-group:hidden">
          Show
        </span>
        <span className="text-muted-foreground hidden text-xs group-open/tool-group:inline">
          Hide
        </span>
      </summary>
      <div
        className={cn("border-border mt-2 space-y-2 border-t pt-2", paddingX)}
      >
        {tools.map((tool, index) => (
          <div key={`${tool.name}-${index}`} className="rounded-lg">
            <ToolCallDetails tool={tool} />
          </div>
        ))}
      </div>
    </details>
  );
}

function ToolCallDetails({ tool }: { tool: InAppAgentToolCallContent }) {
  const resultLabel = tool.error ? "Error" : "Result";

  return (
    <details className="group/tool min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs leading-none font-medium [&::-webkit-details-marker]:hidden">
        <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Used {tool.name}</span>
        <span className="text-muted-foreground text-xs group-open/tool:hidden">
          Show
        </span>
        <span className="text-muted-foreground hidden text-xs group-open/tool:inline">
          Hide
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        <ToolPayload label="Arguments" value={tool.args} />
        {tool.result !== undefined || tool.error !== undefined ? (
          <ToolPayload
            label={resultLabel}
            value={tool.error ?? tool.result ?? ""}
            isError={Boolean(tool.error)}
          />
        ) : null}
      </div>
    </details>
  );
}

function ToolPayload({
  label,
  value,
  isError = false,
}: {
  label: string;
  value: string;
  isError?: boolean;
}) {
  const toolPayload = useMemo(() => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return "{}";
    }

    try {
      return JSON.stringify(JSON.parse(trimmedValue), null, 2);
    } catch {
      return value;
    }
  }, [value]);

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <pre
        className={cn(
          "bg-muted text-muted-foreground max-h-64 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap",
          isError && "text-destructive",
        )}
      >
        {toolPayload}
      </pre>
    </div>
  );
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
      className={cn(
        "prose prose-sm text-foreground prose-strong:text-inherit prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-table:m-0! prose-headings:text-inherit dark:prose-pre:bg-card prose-pre:leading-tight prose-table:border prose-td:p-2 prose-th:p-2 prose-table:bg-muted dark:prose-table:bg-card prose-table:overflow-hidden prose-table:rounded prose-tr:border-b prose-tr:border-border dark:prose-tr:border-border prose-headings:text-sm prose-hr:border-border prose-code:before:content-[''] prose-code:after:content-[''] prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-px dark:prose-code:bg-card prose-code:font-normal max-w-none [&_pre>code]:p-0",
        isCompact
          ? "prose-headings:my-2 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-ol:my-1 prose-blockquote:my-2 prose-pre:my-2 prose-table:my-2 prose-th:text-xs prose-hr:my-3 text-[0.775rem] leading-4"
          : "prose-headings:my-2.5 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-1 prose-ol:my-1.5 prose-blockquote:my-2.5 prose-pre:my-2.5 prose-table:my-2.5 prose-th:text-sm prose-hr:my-5 leading-4.5",
      )}
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
          a: ({ children, href }) => {
            const safeHref = getSafeLinkUrl(href);

            if (!safeHref) {
              return (
                <span className="text-muted-foreground underline">
                  {children}
                </span>
              );
            }

            return (
              <a href={safeHref} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
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
        aria-label={isCopied ? "Copied code" : "Copy code"}
        title={isCopied ? "Copied" : "Copy code"}
        disabled={!code}
        onClick={() => {
          copy(code).catch(() => undefined);
        }}
        className="bg-background/90 text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1.5 right-1.5 z-10 inline-flex size-6 items-center justify-center rounded-md border opacity-80 shadow-sm transition hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
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
