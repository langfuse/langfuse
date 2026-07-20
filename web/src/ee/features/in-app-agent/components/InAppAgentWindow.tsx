"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  BotMessageSquare,
  History,
  Info,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  SendHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import { formatApproximateDuration } from "@/src/utils/dates";
import {
  InAppAgentMessage,
  type InAppAgentMessageContent,
  type InAppAgentMessageRole,
} from "./InAppAgentMessage";
import type { InAppAgentMessageFeedbackValue } from "@/src/ee/features/in-app-agent/schema";
import type { InAppAgentScreenContextDescription } from "@/src/ee/features/in-app-agent/context";
import { InAppAgentToolCallCard } from "@/src/ee/features/in-app-agent/components/InAppAgentToolCallCard";
import {
  type InAppAgentError,
  isInAppAgentRateLimited,
} from "@/src/ee/features/in-app-agent/components/utils/utils";
import styles from "./InAppAgentWindow.module.css";
import { assertUnreachable } from "@/src/utils/types";
import {
  IN_APP_AGENT_QUICK_ACTION_CONTEXTS,
  IN_APP_AGENT_QUICK_ACTION_CONTEXT_ICONS,
  IN_APP_AGENT_QUICK_ACTION_CONTEXT_LABELS,
  getInAppAgentQuickActions,
  isInAppAgentQuickActionContext,
  type InAppAgentQuickAction,
  type InAppAgentQuickActionContext,
  type InAppAgentSubmitOptions,
} from "@/src/ee/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

const AUTO_SCROLL_THRESHOLD_PX = 50;
const SCROLL_DIRECTION_TOLERANCE_PX = 1;
function scrollViewportToBottom(viewport: HTMLDivElement | null) {
  if (!viewport) {
    return;
  }

  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior: "auto",
  });
}

function InAppAgentQuickActionPicker({
  focusedActions,
  initialContext,
  isDisabled,
  onSelectAction,
}: {
  focusedActions?: readonly InAppAgentQuickAction[];
  initialContext: InAppAgentQuickActionContext;
  isDisabled: boolean;
  onSelectAction: (
    action: InAppAgentQuickAction,
    context: InAppAgentQuickActionContext,
    position: number,
  ) => void;
}) {
  const [selectedContext, setSelectedContext] = useState(initialContext);
  const selectedActions =
    selectedContext === initialContext && focusedActions?.length
      ? focusedActions
      : getInAppAgentQuickActions(selectedContext);
  const contextFallbackIcon =
    IN_APP_AGENT_QUICK_ACTION_CONTEXT_ICONS[selectedContext];

  return (
    <>
      <p className="text-foreground mt-3 text-sm font-bold">
        Welcome to the Langfuse Assistant
      </p>
      <p className="text-muted-foreground mt-1 max-w-xs text-center text-xs leading-relaxed">
        What do you want to do?
      </p>
      <Tabs
        value={selectedContext}
        className="mt-4 w-full max-w-sm"
        onValueChange={(value) => {
          if (isInAppAgentQuickActionContext(value)) {
            setSelectedContext(value);
          }
        }}
      >
        <TabsList
          aria-label="Quick action category"
          className="flex h-auto w-full rounded-none border-b bg-transparent p-0"
        >
          {IN_APP_AGENT_QUICK_ACTION_CONTEXTS.map((context) => (
            <TabsTrigger
              key={context}
              value={context}
              disabled={isDisabled}
              className="text-muted-foreground data-[state=active]:border-primary-accent data-[state=active]:text-foreground h-7 min-w-0 flex-1 rounded-none border-b-2 border-transparent bg-transparent px-1 text-xs shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {IN_APP_AGENT_QUICK_ACTION_CONTEXT_LABELS[context]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mt-3 grid w-full max-w-sm grid-cols-1 gap-2">
        {selectedActions.map((action, position) => {
          const ActionIcon = action.icon ?? contextFallbackIcon;

          return (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              className="bg-card hover:bg-muted/60 group h-auto min-h-13 w-full justify-start gap-2 rounded-md px-2.5 py-2 text-left whitespace-normal shadow-xs"
              disabled={isDisabled}
              onClick={() => {
                onSelectAction(action, selectedContext, position);
              }}
            >
              <span className="bg-muted text-primary-accent flex size-7 shrink-0 items-center justify-center rounded-md">
                <ActionIcon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block text-xs leading-snug font-bold">
                  {action.label}
                </span>
                <span
                  className="text-muted-foreground mt-0.5 block truncate text-xs leading-snug font-normal"
                  title={action.description}
                >
                  {action.description}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="text-muted-foreground size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </Button>
          );
        })}
      </div>
    </>
  );
}

function formatScreenContextNotice(
  description: InAppAgentScreenContextDescription,
) {
  if (description.type === "page") {
    return "The assistant is aware of your current page.";
  }

  if (description.type === "observation") {
    return "The assistant is aware that you're viewing this observation.";
  }

  if (description.type === "trace") {
    return "The assistant is aware that you're viewing this trace.";
  }

  if (description.type === "prompt") {
    return "The assistant is aware that you're viewing this prompt.";
  }

  if (description.type === "session") {
    return "The assistant is aware that you're viewing this session.";
  }

  if (description.type === "dataset") {
    return "The assistant is aware that you're viewing this dataset.";
  }

  if (description.type === "datasetItem") {
    return "The assistant is aware that you're viewing this dataset item.";
  }

  if (description.type === "experimentRun") {
    return "The assistant is aware that you're viewing this experiment run.";
  }

  if (
    description.type === "trace-list" ||
    description.type === "observations-list" ||
    description.type === "sessions-list" ||
    description.type === "prompts-list" ||
    description.type === "datasets-list"
  ) {
    const listLabel = {
      "trace-list": "trace",
      "observations-list": "observation",
      "sessions-list": "session",
      "prompts-list": "prompt",
      "datasets-list": "dataset",
    }[description.type];

    return description.hasAppliedFilters
      ? `The assistant is aware of this ${listLabel} view and its filters.`
      : `The assistant is aware of this ${listLabel} view.`;
  }

  return assertUnreachable(description);
}

export type InAppAgentWindowMessage = {
  id: string;
  runId?: string;
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
};

export type InAppAgentWindowConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
};

type InAppAgentWindowCloseButtonProps =
  | {
      showCloseButton: false;
      onClose?: () => void;
    }
  | {
      showCloseButton?: true;
      onClose: () => void;
    };

export type InAppAgentWindowProps = {
  conversations: InAppAgentWindowConversation[];
  disablePendingToolApprovalActions?: boolean;
  error: InAppAgentError | null;
  hasMoreConversations: boolean;
  isAssistantTurnInProgress: boolean;
  isHeaderDragHandleEnabled?: boolean;
  isExpanded: boolean;
  isInputDisabled: boolean;
  isLoadingMoreConversations: boolean;
  messages: InAppAgentWindowMessage[];
  onExpandedChange: (isExpanded: boolean) => void;
  onDeleteConversation: (conversation: InAppAgentWindowConversation) => void;
  onLoadMoreConversations: () => void;
  onNewConversation: () => void;
  onApproveToolCall: (approvalId: string) => Promise<void>;
  onRejectToolCall: (approvalId: string) => Promise<void>;
  onOpenConversationHistory: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSubmit: (
    input: string,
    options?: InAppAgentSubmitOptions,
  ) => boolean | Promise<boolean>;
  onSubmitFeedback: (params: {
    messageId: string;
    runId: string;
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
  screenContextDescription: InAppAgentScreenContextDescription;
  quickActionContext: InAppAgentQuickActionContext;
  focusedQuickActions?: readonly InAppAgentQuickAction[];
  quickActionResetKey: string;
  selectedConversationId: string | undefined;
} & InAppAgentWindowCloseButtonProps;

function InAppAgentRateLimitError({
  error,
  isExpanded,
}: {
  error: Extract<InAppAgentError, { type: "rate_limit" }>;
  isExpanded: boolean;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    Math.ceil((error.retryAt - Date.now()) / 1_000),
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const secondsRemaining = Math.ceil((error.retryAt - Date.now()) / 1_000);
      setSecondsRemaining(secondsRemaining);

      if (secondsRemaining <= 1) {
        window.clearInterval(interval);
      }
    }, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [error.retryAt]);

  return (
    <div
      role="alert"
      className={cn(
        "border-border bg-muted/60 text-foreground w-full rounded-lg border px-2 py-1",
        isExpanded ? "text-sm" : "text-xs",
      )}
    >
      <div className="space-y-0.5">
        <p className="font-bold">
          You&apos;ve reached the assistant request limit
        </p>
        <p>Try again in about {formatApproximateDuration(secondsRemaining)}.</p>
      </div>
    </div>
  );
}

function InAppAgentGenericError({
  error,
  isExpanded,
}: {
  error: Extract<InAppAgentError, { type: "generic" }>;
  isExpanded: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/40 dark:bg-destructive dark:border-destructive-foreground/20 bg-destructive/10 dark:text-destructive-foreground text-destructive rounded-lg border px-2 py-1",
        isExpanded ? "text-sm" : "text-xs",
      )}
    >
      {error.message}
    </div>
  );
}

export function InAppAgentWindow(props: InAppAgentWindowProps) {
  const {
    conversations,
    disablePendingToolApprovalActions = false,
    error,
    hasMoreConversations,
    isAssistantTurnInProgress,
    isHeaderDragHandleEnabled = false,
    isExpanded,
    isInputDisabled: baseIsInputDisabled,
    isLoadingMoreConversations,
    messages,
    onDeleteConversation,
    onExpandedChange,
    onLoadMoreConversations,
    onNewConversation,
    onApproveToolCall,
    onRejectToolCall,
    onOpenConversationHistory,
    onSelectConversation,
    onSubmit,
    onSubmitFeedback,
    focusedQuickActions,
    quickActionContext,
    quickActionResetKey,
    screenContextDescription,
    selectedConversationId,
  } = props;
  const screenContextNotice = formatScreenContextNotice(
    screenContextDescription,
  );
  const capture = usePostHogClientCapture();
  const isRateLimited = isInAppAgentRateLimited(error);
  const isInputDisabled = baseIsInputDisabled || isRateLimited;
  const viewportRef = useRef<HTMLDivElement>(null);
  const isAutoScrollAttachedRef = useRef(true);
  const previousScrollTopRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousIsInputDisabledRef = useRef(isInputDisabled);
  const [input, setInput] = useState("");
  const [isConversationHistoryOpen, setIsConversationHistoryOpen] =
    useState(false);
  const hasUserMessage = messages.some((message) => message.role === "user");
  const pendingToolCalls = messages.flatMap((message) =>
    message.content.type === "toolGroup"
      ? message.content.tools.filter((tool) => tool.approval)
      : [],
  );
  const visibleMessages = messages
    .map((message) => {
      if (message.content.type !== "toolGroup") {
        return message;
      }

      const visibleTools = message.content.tools.filter(
        (tool) => !tool.approval,
      );

      if (visibleTools.length === 0) {
        return null;
      }

      return {
        ...message,
        content: {
          ...message.content,
          tools: visibleTools,
        },
      } satisfies InAppAgentWindowMessage;
    })
    .filter((message): message is InAppAgentWindowMessage => message !== null);

  const submitInput = (content: string, options?: InAppAgentSubmitOptions) => {
    const trimmedContent = content.trim();

    if (!trimmedContent || isInputDisabled) {
      return;
    }

    Promise.resolve(onSubmit(trimmedContent, options))
      .then((submitted) => {
        if (submitted) {
          isAutoScrollAttachedRef.current = true;

          setInput((currentInput) =>
            currentInput.trim() === trimmedContent ? "" : currentInput,
          );

          window.requestAnimationFrame(() => {
            scrollViewportToBottom(viewportRef.current);
          });
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!isAutoScrollAttachedRef.current) {
      return;
    }

    scrollViewportToBottom(viewportRef.current);
  }, [messages]);

  useEffect(() => {
    isAutoScrollAttachedRef.current = true;
    previousScrollTopRef.current = 0;

    scrollViewportToBottom(viewportRef.current);
  }, [selectedConversationId]);

  // Update after refs commit so setInputRef can compare the previous disabled state.
  useEffect(() => {
    previousIsInputDisabledRef.current = isInputDisabled;
  }, [isInputDisabled]);

  const setInputRef = useCallback(
    (input: HTMLTextAreaElement | null) => {
      inputRef.current = input;

      const shouldRefocusInput =
        previousIsInputDisabledRef.current && !isInputDisabled;

      if (input && shouldRefocusInput) {
        input.focus();
      }
    },
    [isInputDisabled],
  );

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [input]);

  return (
    <section
      aria-label="Assistant"
      className="bg-background flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border shadow/5"
    >
      <header
        data-in-app-agent-window-drag-handle={
          isHeaderDragHandleEnabled ? "true" : undefined
        }
        className={cn(
          "bg-card flex min-h-11.25 shrink-0 items-center justify-between gap-2 border-b px-3 py-1",
          isHeaderDragHandleEnabled && "cursor-move touch-none select-none",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="shrink-0 truncate text-sm font-bold" title="Assistant">
            Assistant
          </p>
          <span className="text-muted-foreground rounded border px-1.5 py-1 text-xs leading-none font-bold">
            Beta
          </span>
        </div>
        <div
          className="flex shrink-0 items-center gap-0.5"
          data-movable-resizable-panel-ignore-drag="true"
        >
          <Tooltip delayDuration={100} disableHoverableContent>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={onNewConversation}
                disabled={baseIsInputDisabled}
                aria-label="Start new conversation"
              >
                <Plus className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start new conversation</TooltipContent>
          </Tooltip>
          <DropdownMenu
            open={isConversationHistoryOpen}
            onOpenChange={(nextOpen) => {
              setIsConversationHistoryOpen(nextOpen);

              if (nextOpen) {
                onOpenConversationHistory();
              }
            }}
          >
            <Tooltip delayDuration={100} disableHoverableContent>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    disabled={baseIsInputDisabled}
                    aria-label="Conversation history"
                  >
                    <History className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Conversation history</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              className="max-h-80 w-64 overflow-y-auto"
            >
              <DropdownMenuLabel>Recent conversations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {conversations.length === 0 ? (
                <DropdownMenuItem disabled>
                  No conversations yet
                </DropdownMenuItem>
              ) : (
                conversations.map((conversation) => {
                  const conversationTitle =
                    conversation.title?.trim() || "Untitled conversation";

                  return (
                    <DropdownMenuItem
                      key={conversation.id}
                      className={cn(
                        "flex items-center gap-1",
                        conversation.id === selectedConversationId &&
                          "bg-accent text-accent-foreground",
                      )}
                      onSelect={() => {
                        onSelectConversation(conversation.id);
                      }}
                    >
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={conversationTitle}
                      >
                        {conversationTitle}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive -mr-1.5 shrink-0"
                        disabled={baseIsInputDisabled}
                        aria-label="Delete conversation"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setIsConversationHistoryOpen(false);
                          onDeleteConversation(conversation);
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </DropdownMenuItem>
                  );
                })
              )}
              {hasMoreConversations ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isLoadingMoreConversations}
                    onSelect={onLoadMoreConversations}
                  >
                    {isLoadingMoreConversations ? "Loading..." : "Load more"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip delayDuration={100} disableHoverableContent>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={isExpanded ? "Collapse window" : "Expand window"}
                onClick={() => {
                  onExpandedChange(!isExpanded);
                }}
              >
                {isExpanded ? (
                  <Minimize2 className="size-3" />
                ) : (
                  <Maximize2 className="size-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isExpanded ? "Collapse window" : "Expand window"}
            </TooltipContent>
          </Tooltip>
          {props.showCloseButton !== false ? (
            <Tooltip delayDuration={100} disableHoverableContent>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Minimize assistant"
                  onClick={props.onClose}
                >
                  <Minus className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Minimize assistant</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            const viewport = event.currentTarget;
            const distanceFromBottom =
              viewport.scrollHeight -
              viewport.scrollTop -
              viewport.clientHeight;
            const isNearBottom = distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
            const scrolledUp =
              viewport.scrollTop <
              previousScrollTopRef.current - SCROLL_DIRECTION_TOLERANCE_PX;

            if (scrolledUp && !isNearBottom) {
              isAutoScrollAttachedRef.current = false;
            } else if (isNearBottom) {
              isAutoScrollAttachedRef.current = true;
            }

            previousScrollTopRef.current = viewport.scrollTop;
          }}
        >
          <div
            className={cn(
              "flex min-h-full w-full flex-col py-4",
              isExpanded && "mx-auto max-w-3xl",
              isExpanded ? "px-0" : "px-3",
            )}
          >
            {!hasUserMessage ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-2">
                <div>
                  <BotMessageSquare className="text-muted-foreground mx-auto h-7 w-7" />
                </div>
                <InAppAgentQuickActionPicker
                  key={`${selectedConversationId ?? "new"}:${quickActionResetKey}`}
                  focusedActions={focusedQuickActions}
                  initialContext={quickActionContext}
                  isDisabled={isInputDisabled}
                  onSelectAction={(action, context, position) => {
                    capture("in_app_agent:quick_action_started", {
                      quickActionKey: action.id,
                      quickActionCategory: context,
                      position,
                    });
                    submitInput(action.prompt, {
                      quickAction: {
                        key: action.id,
                        category: context,
                      },
                    });
                  }}
                />
              </div>
            ) : null}

            <ol className="flex w-full flex-col gap-3 pb-4">
              {visibleMessages.map((message, index) => {
                const hasFullWidthContent =
                  message.content.type === "toolGroup" ||
                  message.content.type === "redirectAction" ||
                  message.content.type === "reasoning";

                const nextUserMessageIndex = visibleMessages.findIndex(
                  (nextMessage, nextIndex) =>
                    nextIndex > index && nextMessage.role === "user",
                );
                const nextTurnStartIndex =
                  nextUserMessageIndex === -1
                    ? visibleMessages.length
                    : nextUserMessageIndex;
                const isCurrentTurnInProgress =
                  isAssistantTurnInProgress && nextUserMessageIndex === -1;
                const isLastMessageOfTurn = visibleMessages
                  .slice(index + 1, nextTurnStartIndex)
                  .every((nextMessage) => nextMessage.role !== "assistant");
                const feedbackRunId =
                  message.role === "assistant" &&
                  message.content.type === "text" &&
                  !isCurrentTurnInProgress &&
                  isLastMessageOfTurn
                    ? message.runId
                    : undefined;

                return (
                  <li
                    key={message.id}
                    className={cn(
                      "max-w-[92%]",
                      hasFullWidthContent ? "w-full" : "w-fit",
                      message.role === "user" && "ml-auto",
                    )}
                  >
                    <InAppAgentMessage
                      role={message.role}
                      content={message.content}
                      isCompact={!isExpanded}
                      isFeedbackDisabled={baseIsInputDisabled}
                      onSubmitFeedback={
                        feedbackRunId
                          ? (params) =>
                              onSubmitFeedback({
                                messageId: message.id,
                                runId: feedbackRunId,
                                ...params,
                              })
                          : undefined
                      }
                    />
                  </li>
                );
              })}
            </ol>

            {error?.type === "generic" && (
              <InAppAgentGenericError error={error} isExpanded={isExpanded} />
            )}
          </div>
        </div>
        {pendingToolCalls.length > 0 ? (
          <div
            className={cn(
              "shrink-0 pt-1.5",
              isExpanded ? "px-1.5 pb-2" : "px-3 pb-2",
            )}
          >
            <div
              className={cn(
                "flex flex-col gap-2",
                isExpanded && "mx-auto max-w-3xl",
              )}
            >
              {pendingToolCalls.map((tool, index) => (
                <InAppAgentToolCallCard
                  key={`${tool.approval?.id ?? tool.name}-${index}`}
                  tool={tool}
                  isCompact={!isExpanded}
                  isDisabled={
                    isRateLimited || disablePendingToolApprovalActions
                  }
                  onApproveToolCall={onApproveToolCall}
                  onRejectToolCall={onRejectToolCall}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div
          aria-hidden={isAssistantTurnInProgress}
          className={cn(
            "flex shrink-0 flex-col overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none",
            isAssistantTurnInProgress
              ? "max-h-0 opacity-0"
              : "max-h-40 opacity-100",
          )}
        >
          <div className="p-2">
            <div
              className={cn(
                "flex w-full flex-col gap-1.5",
                isExpanded && "mx-auto max-w-3xl",
              )}
            >
              <p
                className={cn(
                  "border-border bg-muted/60 text-foreground flex w-full items-center gap-1 rounded-lg border px-2 py-1",
                  isExpanded ? "text-sm" : "text-xs",
                )}
              >
                <Info aria-hidden="true" className="size-3 shrink-0" />
                <span className="min-w-0 truncate" title={screenContextNotice}>
                  {screenContextNotice}
                </span>
              </p>
            </div>
          </div>
        </div>
        {error?.type === "rate_limit" && (
          <div
            className={cn(
              "shrink-0 px-2 pb-2",
              isAssistantTurnInProgress && "pt-2",
            )}
          >
            <div className={cn(isExpanded && "mx-auto max-w-3xl")}>
              <InAppAgentRateLimitError error={error} isExpanded={isExpanded} />
            </div>
          </div>
        )}
        {isAssistantTurnInProgress && pendingToolCalls.length === 0 ? (
          <div
            className={cn(
              "pointer-events-none relative h-px w-full shrink-0 select-none",
              isExpanded && "mx-auto max-w-3xl",
            )}
          >
            <div className="absolute top-0 h-4 w-full -translate-y-full overflow-hidden">
              <div className="absolute top-0 h-12 w-full bg-radial from-(--color-3) to-transparent to-60% bg-center opacity-25" />
            </div>
            <div className="absolute bottom-0 left-0 h-px w-full overflow-hidden">
              <div
                aria-hidden="true"
                className={cn("h-[4rem]", styles.loadingGradient)}
              />
              {isExpanded && (
                <>
                  {/* Gradient overlays for expanded state so that the edges fade out */}
                  {/* Match the assistant surface (bg-background) so edges fade cleanly */}
                  <div className="from-background absolute top-0 right-0 h-full w-1/2 bg-linear-to-l to-transparent" />
                  <div className="from-background absolute top-0 left-0 h-full w-1/2 bg-linear-to-r to-transparent" />
                </>
              )}
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            "p-1.5",
            isExpanded ? "pt-0" : "bg-card",
            !isExpanded && hasUserMessage && "border-t",
          )}
        >
          <form
            className={cn(
              "relative flex w-full items-end gap-2 rounded-md",
              isExpanded &&
                "mx-auto max-w-3xl cursor-text flex-col border focus-within:ring focus-within:ring-blue-500 focus-within:ring-offset-0",
            )}
            onClick={() => {
              if (isExpanded) {
                inputRef.current?.focus();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              submitInput(input);
            }}
          >
            <textarea
              autoFocus={!isExpanded}
              ref={setInputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={isInputDisabled}
              aria-label="Message the assistant"
              placeholder="Let me know what I can do for you..."
              rows={1}
              className={cn(
                "bg-background placeholder:text-foreground-tertiary w-full flex-1 resize-none overflow-y-auto rounded-md text-sm leading-5 disabled:cursor-not-allowed disabled:opacity-60",
                isExpanded
                  ? "max-h-40 min-h-14 border-none ring-0"
                  : "border-input max-h-40 min-h-8 px-3 py-1",
              )}
            />
            {!isExpanded && (
              <Button
                type="submit"
                size="icon"
                className="h-8 w-8 rounded-md border"
                aria-label="Send message"
                variant="outline"
                disabled={isInputDisabled || !input.trim()}
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            )}

            {isExpanded && (
              <div className="flex w-full justify-end p-1">
                <Button
                  type="submit"
                  className="h-8 w-fit rounded-md px-3"
                  aria-label="Send message"
                  disabled={isInputDisabled || !input.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  Send <SendHorizontal className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
