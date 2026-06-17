"use client";

import {
  Check,
  Copy,
  BookOpenText,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { getSafeLinkUrl } from "@/src/components/ui/safe-url";
import { stripBasePath } from "@/src/utils/redirect";
import { cn } from "@/src/utils/tailwind";
import {
  forwardRef,
  Children,
  Fragment,
  isValidElement,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  InAppAgentMessageFeedback,
  InAppAgentMessageFeedbackValue,
  InAppAgentMessageSource,
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
  parseInAppAgentResourceHref,
  type InAppAgentResourceReference as ParsedResourceReference,
} from "@/src/ee/features/in-app-agent/components/utils/resourceReference";
import type { InAppAgentResourceReferencePresentation } from "@/src/ee/features/in-app-agent/components/InAppAgentResourceReference";
import styles from "./InAppAgentMessage.module.css";

export type InAppAgentMessageRole = "assistant" | "user";

export type InAppAgentMessageContent =
  | { type: "loading"; label?: string }
  | {
      type: "text";
      text: string;
      feedback?: InAppAgentMessageFeedback;
      sources?: InAppAgentMessageSource[];
    }
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

export type InAppAgentResourceReferenceRenderer = (props: {
  resource: ParsedResourceReference;
  label: ReactNode;
  presentation: InAppAgentResourceReferencePresentation;
}) => ReactNode;

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
  renderResourceReference?: InAppAgentResourceReferenceRenderer;
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
  renderResourceReference,
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

  if (content.type === "text" && role === "assistant") {
    return (
      <AssistantMessageWithFeedback
        content={content}
        isCompact={isCompact}
        isFeedbackDisabled={isFeedbackDisabled}
        renderResourceReference={renderResourceReference}
        windowZIndex={windowZIndex}
        onSubmitFeedback={onSubmitFeedback}
      />
    );
  }

  return (
    <MessageCard
      role={role}
      content={content}
      isCompact={isCompact}
      renderResourceReference={renderResourceReference}
    />
  );
}

const MessageCard = forwardRef<
  HTMLDivElement,
  {
    role: InAppAgentMessageRole;
    content: Exclude<InAppAgentMessageContent, { type: "toolGroup" }>;
    isCompact: boolean;
    renderResourceReference?: InAppAgentResourceReferenceRenderer;
  }
>(function MessageCard(
  { role, content, isCompact, renderResourceReference },
  ref,
) {
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
        <MessageText
          role={role}
          text={content.text}
          isCompact={isCompact}
          renderResourceReference={renderResourceReference}
        />
      )}
    </div>
  );
});

function AssistantMessageWithFeedback({
  content,
  isCompact,
  isFeedbackDisabled,
  renderResourceReference,
  windowZIndex,
  onSubmitFeedback,
}: {
  content: Extract<InAppAgentMessageContent, { type: "text" }>;
  isCompact: boolean;
  isFeedbackDisabled: boolean;
  renderResourceReference?: InAppAgentResourceReferenceRenderer;
  windowZIndex?: number;
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
        renderResourceReference={renderResourceReference}
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
                windowZIndex={windowZIndex}
                onSubmitFeedback={onSubmitFeedback}
              />
            ) : null}
            {hasSources ? (
              <SourcesPopover
                sources={sources}
                isCompact={isCompact}
                windowZIndex={windowZIndex}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageFeedbackControls({
  feedback,
  isCompact,
  isFeedbackDisabled,
  windowZIndex,
  onSubmitFeedback,
}: {
  feedback?: InAppAgentMessageFeedback;
  isCompact: boolean;
  isFeedbackDisabled: boolean;
  windowZIndex?: number;
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
  );
}

function SourcesPopover({
  sources,
  isCompact,
  windowZIndex,
}: {
  sources: InAppAgentMessageSource[];
  isCompact: boolean;
  windowZIndex?: number;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground/70 hover:text-muted-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium",
            isCompact && "py-0.5",
          )}
        >
          <BookOpenText className={cn(isCompact ? "size-3" : "size-3.5")} />
          Sources
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-72 p-1.5"
        style={
          typeof windowZIndex === "number"
            ? { zIndex: windowZIndex + 1 }
            : undefined
        }
      >
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
              <span className="text-foreground min-w-0 flex-1 truncate text-xs">
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
        <span className="min-w-0 flex-1 truncate py-0.5">{label}</span>
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
        <span className="min-w-0 flex-1 truncate py-0.5">Used {tool.name}</span>
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
  renderResourceReference,
}: {
  role: InAppAgentMessageRole;
  text: string;
  isCompact: boolean;
  renderResourceReference?: InAppAgentResourceReferenceRenderer;
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

          p: ({ children }) => (
            <ResourceAwareParagraph
              renderResourceReference={renderResourceReference}
            >
              {children}
            </ResourceAwareParagraph>
          ),
          a: ({ children, href }) => (
            <ResourceMarkdownLink
              href={href}
              renderResourceReference={renderResourceReference}
            >
              {children}
            </ResourceMarkdownLink>
          ),
          hr: ({ children }) => <hr>{children}</hr>,
          ul: ({ children }) => (
            <ResourceAwareList
              as="ul"
              renderResourceReference={renderResourceReference}
            >
              {children}
            </ResourceAwareList>
          ),
          ol: ({ children }) => (
            <ResourceAwareList
              as="ol"
              renderResourceReference={renderResourceReference}
            >
              {children}
            </ResourceAwareList>
          ),
          li: ({ children }) => (
            <ResourceAwareListItem
              renderResourceReference={renderResourceReference}
            >
              {children}
            </ResourceAwareListItem>
          ),
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

type ResourceMarkdownLinkProps = {
  children: ReactNode;
  href?: string;
  presentation?: InAppAgentResourceReferencePresentation;
  renderResourceReference?: InAppAgentResourceReferenceRenderer;
};

type NormalizedResourceLink = {
  label: ReactNode;
  resource: ParsedResourceReference;
};

function ResourceMarkdownLink({
  children,
  href,
  presentation = "inline",
  renderResourceReference,
}: ResourceMarkdownLinkProps) {
  const resource = parseInAppAgentResourceHref(href);

  if (!resource || !renderResourceReference) {
    return <SmartLink href={href}>{children}</SmartLink>;
  }

  return renderResourceReference({
    label: children,
    presentation,
    resource,
  });
}

function ResourceAwareParagraph({
  children,
  renderResourceReference,
}: {
  children: ReactNode;
  renderResourceReference?: InAppAgentResourceReferenceRenderer;
}) {
  const standaloneResource = getStandaloneResourceLink(
    children,
    renderResourceReference,
  );

  if (standaloneResource) {
    return <ResourceRowGroup>{standaloneResource}</ResourceRowGroup>;
  }

  return <p>{children}</p>;
}

function ResourceAwareList({
  as: ListTag,
  children,
  renderResourceReference,
}: {
  as: "ul" | "ol";
  children: ReactNode;
  renderResourceReference?: InAppAgentResourceReferenceRenderer;
}) {
  const resourceLinks = getStandaloneResourceListLinks(
    children,
    renderResourceReference,
  );

  if (renderResourceReference && resourceLinks && resourceLinks.length > 1) {
    return (
      <ResourceRowGroup>
        {resourceLinks.map(({ label, resource }, index) => (
          <Fragment key={index}>
            {renderResourceReference({
              label,
              presentation: "row",
              resource,
            })}
          </Fragment>
        ))}
      </ResourceRowGroup>
    );
  }

  if (resourceLinks) {
    return (
      <ListTag className="not-prose m-0 list-none p-0">{children}</ListTag>
    );
  }

  return <ListTag>{children}</ListTag>;
}

function ResourceAwareListItem({
  children,
  renderResourceReference,
}: {
  children: ReactNode;
  renderResourceReference?: InAppAgentResourceReferenceRenderer;
}) {
  const standaloneResource = getStandaloneResourceLink(
    children,
    renderResourceReference,
  );

  if (standaloneResource) {
    return (
      <li className="list-none p-0">
        <ResourceRowGroup>{standaloneResource}</ResourceRowGroup>
      </li>
    );
  }

  return <li>{children}</li>;
}

const getStandaloneResourceLink = (
  children: ReactNode,
  renderResourceReference?: InAppAgentResourceReferenceRenderer,
) => {
  if (!renderResourceReference) {
    return null;
  }

  const resourceLink = getResourceLinkFromChildren(children);
  if (!resourceLink) {
    return null;
  }

  return renderResourceReference({
    label: resourceLink.label,
    presentation: "row",
    resource: resourceLink.resource,
  });
};

function ResourceRowGroup({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose border-border bg-background my-2 overflow-hidden rounded-lg border">
      {children}
    </div>
  );
}

const getStandaloneResourceListLinks = (
  children: ReactNode,
  renderResourceReference?: InAppAgentResourceReferenceRenderer,
) => {
  if (!renderResourceReference) {
    return null;
  }

  const listItems = Children.toArray(children).filter((child) => {
    return typeof child === "string" ? child.trim().length > 0 : true;
  });

  if (listItems.length < 2) {
    return null;
  }

  const resourceRows: NormalizedResourceLink[] = [];
  let resourceType: ParsedResourceReference["type"] | undefined;

  for (const item of listItems) {
    const resourceLink = getResourceLinkFromListItem(item);

    if (!resourceLink) {
      return null;
    }

    if (resourceType && resourceType !== resourceLink.resource.type) {
      return null;
    }

    resourceType = resourceLink.resource.type;

    resourceRows.push(resourceLink);
  }

  return resourceRows;
};

const getResourceLinkFromListItem = (
  item: ReactNode,
): NormalizedResourceLink | null => {
  if (!isValidElement<{ children?: ReactNode }>(item)) {
    return null;
  }

  return getResourceLinkFromChildren(item.props.children);
};

const getResourceLinkFromChildren = (children: ReactNode) => {
  const child = getOnlyMeaningfulChild(children);
  return child ? getResourceLinkFromNode(child) : null;
};

const getResourceLinkFromNode = (
  value: ReactNode,
): NormalizedResourceLink | null => {
  if (isResourceMarkdownLinkElement(value)) {
    return getResourceLinkFromHref(value.props.href, value.props.children);
  }

  if (!isValidElement<{ children?: ReactNode; href?: unknown }>(value)) {
    return null;
  }

  if (typeof value.props.href === "string") {
    return getResourceLinkFromHref(value.props.href, value.props.children);
  }

  return getResourceLinkFromChildren(value.props.children);
};

const getResourceLinkFromHref = (
  href: string | undefined,
  label: ReactNode,
): NormalizedResourceLink | null => {
  const resource = parseInAppAgentResourceHref(href);
  return resource ? { label, resource } : null;
};

const getOnlyMeaningfulChild = (children: ReactNode) => {
  const meaningfulChildren = Children.toArray(children).filter((child) => {
    return typeof child === "string" ? child.trim().length > 0 : true;
  });

  return meaningfulChildren.length === 1 ? meaningfulChildren[0] : null;
};

const isResourceMarkdownLinkElement = (
  value: ReactNode,
): value is ReactElement<ResourceMarkdownLinkProps> =>
  isValidElement(value) && value.type === ResourceMarkdownLink;

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
