/* eslint-disable no-nested-ternary, @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowDown,
  ChevronRight,
  History,
  Info,
  Maximize2,
  TriangleAlert,
  Minimize2,
  Minus,
  Plus,
  SendHorizontal,
  Square,
  Trash2,
  X,
} from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import textShimmerStyles from "@/src/components/ui/text-shimmer.module.css";
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
import { useIsHandheld } from "@/src/hooks/use-mobile";
import { formatApproximateDuration } from "@/src/utils/dates";
import {
  InAppAgentMessage,
  type InAppAgentMessageContent,
  type InAppAgentMessageRole,
} from "./InAppAgentMessage";
import type { InAppAgentMessageFeedbackValue } from "../schema";
import {
  IN_APP_AGENT_GENERIC_ERROR_MESSAGE,
  IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
  type InAppAgentQuestionnaireAnswers,
  type InAppAgentQuestionnaireQuestion,
} from "@langfuse/shared/in-app-agent";
import type { InAppAgentScreenContextDescription } from "@/src/features/in-app-agent/context";
import type { InAppAgentActivityByConversationId } from "@/src/features/in-app-agent/lib/inAppAgentActivity";
import type { SettledActivityOutcome } from "@/src/features/in-app-agent/lib/backgroundExecutionSession";
import { ConversationActivityIndicator } from "@/src/features/in-app-agent/components/ConversationActivityIndicator";
import { InAppAgentBackgroundHint } from "@/src/features/in-app-agent/components/InAppAgentBackgroundHint";
import { InAppAgentNotice } from "@/src/features/in-app-agent/components/InAppAgentNotice";
import { useInAppAgentBackgroundHint } from "@/src/features/in-app-agent/lib/useInAppAgentBackgroundHint";
import { InAppAgentToolCallCard } from "@/src/features/in-app-agent/components/InAppAgentToolCallCard";
import { InAppAgentQuestionnaireCard } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/InAppAgentQuestionnaireCard";
import { parseQuestionnaireQuestions } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireCard/fns/parseQuestionnaireQuestions";
import { InAppAgentQuestionnaireSummary } from "@/src/features/in-app-agent/components/InAppAgentQuestionnaireSummary/InAppAgentQuestionnaireSummary";
import {
  buildConversationDisplayItems,
  type ConversationDisplayItem,
} from "@/src/features/in-app-agent/fns/buildConversationDisplayItems";
import {
  getInAppAgentActivityProgressLabel,
  type InAppAgentError,
  type InAppAgentToolCallContent,
  isInAppAgentRateLimited,
} from "@/src/features/in-app-agent/components/utils/utils";
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
} from "@/src/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";

const AUTO_SCROLL_THRESHOLD_PX = 50;
const SCROLL_DIRECTION_TOLERANCE_PX = 1;
function isViewportNearBottom(viewport: HTMLElement) {
  return (
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
    AUTO_SCROLL_THRESHOLD_PX
  );
}

function scrollViewportToBottom(
  viewport: HTMLDivElement | null,
  behavior: ScrollBehavior = "auto",
) {
  if (!viewport) {
    return;
  }

  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior,
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
        Hi I&apos;m Halo, your Langfuse assistant
      </p>
      <p className="text-muted-foreground mt-1 max-w-xs text-center text-xs leading-relaxed">
        What do you want to do?
      </p>
      <div className="mt-4 w-full max-w-sm">
        <Tabs
          value={selectedContext}
          onValueChange={(value) => {
            if (isInAppAgentQuickActionContext(value)) {
              setSelectedContext(value);
            }
          }}
        >
          <div className="max-w-full min-w-0 overflow-x-auto">
            <Tabs.List aria-label="Quick action category" variant="underline">
              {IN_APP_AGENT_QUICK_ACTION_CONTEXTS.map((context) => (
                <Tabs.Trigger
                  key={context}
                  value={context}
                  disabled={isDisabled}
                  label={IN_APP_AGENT_QUICK_ACTION_CONTEXT_LABELS[context]}
                />
              ))}
            </Tabs.List>
          </div>
        </Tabs>
      </div>
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
                <ActionIcon size="base" color="default" aria-hidden="true" />
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
                size="base"
                color="muted"
                __rawClassName="transition-transform group-hover:translate-x-0.5"
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
    return "Current page in context";
  }

  if (description.type === "observation") {
    return "Current observation in context";
  }

  if (description.type === "trace") {
    return "Current trace in context";
  }

  if (description.type === "prompt") {
    return "Current prompt in context";
  }

  if (description.type === "session") {
    return "Current session in context";
  }

  if (description.type === "dataset") {
    return "Current dataset in context";
  }

  if (description.type === "datasetItem") {
    return "Current dataset item in context";
  }

  if (description.type === "experimentRun") {
    return "Current experiment run in context";
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

    return `Current ${listLabel} view in context`;
  }

  return assertUnreachable(description);
}

export type InAppAgentWindowMessage = {
  id: string;
  feedbackMessageId?: string;
  runId?: string;
  timestamp?: number;
  role: InAppAgentMessageRole;
  content: InAppAgentMessageContent;
};

function formatWorkedDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    const parts = [`${hours}h`];
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (seconds > 0) {
      parts.push(`${seconds}s`);
    }
    return parts.join(" ");
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${totalSeconds}s`;
}

function getSettledActivityGroupLabel({
  durationSeconds,
  outcome,
}: {
  durationSeconds: number | null;
  outcome: SettledActivityOutcome;
}) {
  const duration =
    durationSeconds === null ? null : formatWorkedDuration(durationSeconds);

  if (outcome === "stopped") {
    return duration ? `Stopped after ${duration}` : "Stopped";
  }

  if (outcome === "failed") {
    return duration ? `Failed after ${duration}` : "Failed";
  }

  return duration ? `Worked for ${duration}` : "Activity";
}

function getActivityGroupLabel({
  durationSeconds,
  hasDetails,
  isAwaitingApproval,
  isInProgress,
  outcome,
  toolNames,
}: {
  durationSeconds: number | null;
  hasDetails: boolean;
  isAwaitingApproval: boolean;
  isInProgress: boolean;
  outcome: SettledActivityOutcome;
  toolNames: string[];
}) {
  if (!isInProgress) {
    return getSettledActivityGroupLabel({ durationSeconds, outcome });
  }

  // The run has stopped and owes the user a decision, so it must not keep
  // narrating the last thing it did.
  if (isAwaitingApproval) {
    return "Waiting for your approval…";
  }

  return hasDetails
    ? getInAppAgentActivityProgressLabel(toolNames)
    : "There for you in a second…";
}

function AssistantActivityGroup({
  endTimestamp,
  isAwaitingApproval,
  isCompact,
  isInProgress,
  messages,
  outcome,
  startTimestamp,
}: {
  endTimestamp?: number;
  isAwaitingApproval: boolean;
  isCompact: boolean;
  isInProgress: boolean;
  messages: InAppAgentWindowMessage[];
  outcome: SettledActivityOutcome;
  startTimestamp?: number;
}) {
  const hasDetails = messages.length > 0;
  const [isOpen, setIsOpen] = useState(false);
  const durationSeconds =
    startTimestamp !== undefined && endTimestamp !== undefined
      ? Math.max(1, Math.round((endTimestamp - startTimestamp) / 1_000))
      : null;
  const toolNames = messages.flatMap((message) =>
    message.content.type === "toolGroup"
      ? message.content.tools.map((tool) => tool.name)
      : [],
  );
  const label = getActivityGroupLabel({
    durationSeconds,
    hasDetails,
    isAwaitingApproval,
    isInProgress,
    outcome,
    toolNames,
  });

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={label}
        className={cn(
          "text-muted-foreground focus-visible:ring-ring flex w-full items-center gap-1 py-1 text-left outline-none focus-visible:ring-2",
          isCompact ? "text-[0.775rem]" : "text-sm",
        )}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
      >
        {/* Nothing is happening while we wait on the user, so hold the shimmer. */}
        <span
          className={cn(
            isInProgress &&
              !isAwaitingApproval &&
              textShimmerStyles.textShimmer,
          )}
        >
          {label}
        </span>
        <ChevronRight
          aria-hidden="true"
          size="base"
          color="tertiary"
          __rawClassName={cn(
            "translate-y-px transition-transform",
            isOpen && "rotate-90",
          )}
        />
      </button>
      {isOpen && hasDetails ? (
        <div className="flex flex-col gap-1 pt-2 pb-1">
          {messages.map((message) => (
            <InAppAgentMessage
              key={message.id}
              role={message.role}
              content={message.content}
              isCompact={isCompact}
              isFinalAnswer={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Owns the conversation viewport and everything about following it: whether we
 * are pinned to the newest message, the `Latest` escape hatch, and the smooth
 * scroll it starts. Mount this keyed by conversation so switching gives it a
 * fresh scroll position instead of an effect that resets one.
 */
function ConversationScroller({
  children,
  displayItems,
}: {
  children: ReactNode;
  /** What is actually rendered, so the height can only change with it. Keying
   * on the raw messages misses a turn that settles without new messages and
   * reveals its answer. */
  displayItems: ConversationDisplayItem[];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // Sticky intent to follow, which survives scrolling down through the middle
  // of the transcript; `isAtLatest` only says whether the pill is needed.
  const isAutoScrollAttachedRef = useRef(true);
  const isScrollingToLatestRef = useRef(false);
  const previousScrollTopRef = useRef(0);
  // The newest user message, rather than the newest message: a turn often
  // appends a placeholder after it, which would mask the send.
  const lastUserMessageId = displayItems.findLast(
    (item) => item.type === "user",
  )?.message.id;
  const [followState, setFollowState] = useState({
    lastUserMessageId,
    isAtLatest: true,
  });
  // Saying something is a request to follow along again, even from far up.
  // Derived rather than keyed on a remount, which would take the transcript —
  // and every drawer the user has opened — down with it.
  const hasNewUserMessage = followState.lastUserMessageId !== lastUserMessageId;
  const isAtLatest = hasNewUserMessage || followState.isAtLatest;
  if (hasNewUserMessage) {
    isAutoScrollAttachedRef.current = true;
  }
  const setIsAtLatest = useCallback(
    (nextIsAtLatest: boolean) => {
      setFollowState({ lastUserMessageId, isAtLatest: nextIsAtLatest });
    },
    [lastUserMessageId],
  );

  useEffect(() => {
    if (isAutoScrollAttachedRef.current) {
      scrollViewportToBottom(viewportRef.current);
    }
  }, [displayItems]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    // Content can shrink back under the viewport without a scroll event — a
    // collapsing activity drawer does exactly that.
    const syncIsAtLatest = () => {
      if (isScrollingToLatestRef.current) {
        return;
      }

      if (isViewportNearBottom(viewport)) {
        isAutoScrollAttachedRef.current = true;
        // The raw setter keeps this subscription off `lastUserMessageId`: a
        // resize says nothing about which send we have caught up with.
        setFollowState((state) => ({ ...state, isAtLatest: true }));
      }
    };

    const observer = new ResizeObserver(syncIsAtLatest);
    const content = viewport.firstElementChild;
    if (content) {
      observer.observe(content);
    }
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewportRef}
        // `overscroll-contain`: the conversation is the only scroller, so its
        // rubber-band must not chain out to whatever is behind it.
        className="h-full overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          const viewport = event.currentTarget;
          const isNearBottom = isViewportNearBottom(viewport);
          const scrolledUp =
            viewport.scrollTop <
            previousScrollTopRef.current - SCROLL_DIRECTION_TOLERANCE_PX;

          // Our own smooth scroll emits a stream of events on the way down;
          // only arriving, or the user overriding it, ends that.
          if (isScrollingToLatestRef.current) {
            if (isNearBottom) {
              isScrollingToLatestRef.current = false;
              isAutoScrollAttachedRef.current = true;
              setIsAtLatest(true);
            } else if (scrolledUp) {
              isScrollingToLatestRef.current = false;
              isAutoScrollAttachedRef.current = false;
              setIsAtLatest(false);
            }

            previousScrollTopRef.current = viewport.scrollTop;
            return;
          }

          if (scrolledUp && !isNearBottom) {
            isAutoScrollAttachedRef.current = false;
          } else if (isNearBottom) {
            isAutoScrollAttachedRef.current = true;
          }

          setIsAtLatest(isNearBottom);
          previousScrollTopRef.current = viewport.scrollTop;
        }}
      >
        {children}
      </div>
      {/* The transcript fades into the composer gutter rather than ending on a
          hard cut. Above the "Latest" pill in DOM order so the pill stays crisp. */}
      <div
        aria-hidden="true"
        className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t to-transparent"
      />
      {!isAtLatest ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Scroll to latest message"
          className="bg-background absolute bottom-3 left-1/2 z-10 h-8 -translate-x-1/2 rounded-full px-3 shadow-sm"
          onClick={() => {
            isAutoScrollAttachedRef.current = true;
            isScrollingToLatestRef.current = true;
            setIsAtLatest(true);
            const prefersReducedMotion =
              typeof window.matchMedia === "function" &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            scrollViewportToBottom(
              viewportRef.current,
              prefersReducedMotion ? "auto" : "smooth",
            );
          }}
        >
          <ArrowDown size="base" color="default" />
          Latest
        </Button>
      ) : null}
    </div>
  );
}

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

type InAppAgentWindowNotice = {
  text: string;
  tone: "info" | "warning";
};

export type InAppAgentWindowExecutionUi = {
  notice: InAppAgentWindowNotice | null;
  /** How the latest settled turn ended. Earlier turns stay "worked". */
  activityOutcome?: SettledActivityOutcome;
  stop: {
    status: "available" | "stopping";
    onStop: () => void;
  } | null;
};

export type InAppAgentWindowProps = {
  conversations: InAppAgentWindowConversation[];
  /** Per-conversation attention state, for the recent-conversation indicators. */
  activityByConversationId: InAppAgentActivityByConversationId;
  error: InAppAgentError | null;
  executionUi: InAppAgentWindowExecutionUi;
  hasMoreConversations: boolean;
  isAssistantTurnInProgress: boolean;
  /** True while the run itself is unfinished. Reveal animation of a finished
   * turn must not hide the answer. Defaults to `isAssistantTurnInProgress`. */
  isRunUnsettled?: boolean;
  /** The run has stopped on a tool approval, so the open turn is parked on the
   * user rather than working. */
  isAwaitingApproval?: boolean;
  isHeaderDragHandleEnabled?: boolean;
  isExpanded: boolean;
  isConversationInteractionDisabled: boolean;
  /** Distinguishes a loading transcript from an empty conversation. */
  isSelectedConversationHydrating: boolean;
  isLoadingMoreConversations: boolean;
  messages: InAppAgentWindowMessage[];
  onExpandedChange: (isExpanded: boolean) => void;
  onDeleteConversation: (conversation: InAppAgentWindowConversation) => void;
  onLoadMoreConversations: () => void;
  onNewConversation: () => void;
  onApproveToolCall: (approvalId: string) => Promise<void>;
  onAlwaysAllowToolCall?: (approvalId: string) => Promise<void>;
  onRejectToolCall: (approvalId: string) => Promise<void>;
  onAnswerQuestionnaire: (
    approvalId: string,
    answers: InAppAgentQuestionnaireAnswers,
  ) => Promise<void>;
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
  /** Titles the window. Null until the server has named the conversation,
   * which is when the product name shows instead. */
  selectedConversationTitle: string | null;
  /** Rendered right after the title. */
  titleActions?: ReactNode;
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
    <InAppAgentNotice
      icon={<Info aria-hidden="true" size="sm" />}
      isExpanded={isExpanded}
      role="alert"
      tone="neutral"
    >
      <span className="space-y-0.5">
        <span className="block font-bold">
          You&apos;ve reached the Halo request limit
        </span>
        <span className="block">
          Try again in about {formatApproximateDuration(secondsRemaining)}.
        </span>
      </span>
    </InAppAgentNotice>
  );
}

function InAppAgentIssueNotice({ isExpanded }: { isExpanded: boolean }) {
  return (
    <InAppAgentNotice
      icon={<Info aria-hidden="true" size="sm" />}
      isExpanded={isExpanded}
      role="alert"
      tone="danger"
    >
      {IN_APP_AGENT_GENERIC_ERROR_MESSAGE}
    </InAppAgentNotice>
  );
}

export function InAppAgentWindow(props: InAppAgentWindowProps) {
  const {
    activityByConversationId,
    conversations,
    error,
    executionUi,
    hasMoreConversations,
    isAssistantTurnInProgress,
    isRunUnsettled = isAssistantTurnInProgress,
    isAwaitingApproval = false,
    isHeaderDragHandleEnabled = false,
    isConversationInteractionDisabled,
    isLoadingMoreConversations,
    isSelectedConversationHydrating,
    messages,
    onDeleteConversation,
    onExpandedChange,
    onLoadMoreConversations,
    onNewConversation,
    onApproveToolCall,
    onAlwaysAllowToolCall,
    onRejectToolCall,
    onAnswerQuestionnaire,
    onOpenConversationHistory,
    onSelectConversation,
    onSubmit,
    onSubmitFeedback,
    focusedQuickActions,
    quickActionContext,
    quickActionResetKey,
    screenContextDescription,
    selectedConversationId,
    selectedConversationTitle,
    titleActions,
  } = props;
  const screenContextNotice = formatScreenContextNotice(
    screenContextDescription,
  );
  const capture = usePostHogClientCapture();
  // A phone renders the assistant full-screen (see InAppAgentWindowShell), so
  // it drops the window chrome and never auto-focuses — that springs the
  // keyboard over the conversation.
  const isHandheld = useIsHandheld();
  // Full-screen has no expanded variant. Narrowing a desktop window into
  // handheld while expanded would otherwise keep the desktop-expanded layout
  // with no toggle left to undo it; the prop survives, so widening restores it.
  const isExpanded = props.isExpanded && !isHandheld;
  const isRateLimited = isInAppAgentRateLimited(error);
  const isComposerDisabled = isConversationInteractionDisabled;
  const isSubmitDisabled =
    isComposerDisabled || isRateLimited || isAssistantTurnInProgress;
  const backgroundNotice = executionUi.notice;
  const executionStop = executionUi.stop;
  const canStopRun = executionStop !== null && isAssistantTurnInProgress;
  const isCancellingRun = executionStop?.status === "stopping";
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousIsInputDisabledRef = useRef(isComposerDisabled);
  const previousIsAssistantTurnInProgressRef = useRef(
    isAssistantTurnInProgress,
  );
  const [input, setInput] = useState("");
  const [isConversationHistoryOpen, setIsConversationHistoryOpen] =
    useState(false);
  // Same conversations the launcher badge counts, narrowed to the ones behind
  // this trigger: the list is the only place to act on them.
  const historyAttentionCount = [...activityByConversationId.values()].filter(
    (entry) => entry.needsAttention,
  ).length;
  const historyAttentionSuffix =
    historyAttentionCount > 0
      ? ` (${historyAttentionCount} ${historyAttentionCount === 1 ? "needs" : "need"} attention)`
      : "";
  const hasUserMessage = messages.some((message) => message.role === "user");
  const conversationTitle = selectedConversationTitle?.trim() || null;
  const pendingToolCalls = messages.flatMap((message) =>
    message.content.type === "toolGroup"
      ? message.content.tools.filter((tool) => tool.approval)
      : [],
  );
  // Rebuilding every turn on each composer keystroke is wasted work: the
  // transcript only changes when the messages or the run's settledness do.
  const displayItems = useMemo(
    () => buildConversationDisplayItems(messages, isRunUnsettled),
    [messages, isRunUnsettled],
  );
  const lastUserIndex = displayItems.findLastIndex(
    (item) => item.type === "user",
  );
  // activityOutcome is for the latest turn. If that turn never produced an
  // activity group (failed or cancelled before the first assistant token),
  // do not stamp the outcome onto an earlier turn.
  const lastSettledActivityIndex = displayItems.findLastIndex(
    (item, index) =>
      item.type === "activity" && !item.isInProgress && index > lastUserIndex,
  );
  const hasSettledAssistantReply = displayItems.some(
    (item) => item.type === "assistant" && item.isFinalAnswer,
  );

  const backgroundHint = useInAppAgentBackgroundHint({
    isRunActive: isAssistantTurnInProgress,
  });

  const submitInput = (content: string, options?: InAppAgentSubmitOptions) => {
    const trimmedContent = content.trim();

    if (!trimmedContent || isSubmitDisabled) {
      return;
    }

    // Read before the parent appends the message: the hint belongs to the
    // message that opens a conversation, not to every turn inside it.
    const startsConversation = !hasUserMessage;

    Promise.resolve(onSubmit(trimmedContent, options))
      .then((submitted) => {
        if (submitted) {
          if (startsConversation) {
            backgroundHint.show();
          }

          setInput((currentInput) =>
            currentInput.trim() === trimmedContent ? "" : currentInput,
          );
        }
      })
      .catch(() => undefined);
  };

  // Update after refs commit so setInputRef can compare the previous disabled state.
  useEffect(() => {
    previousIsInputDisabledRef.current = isComposerDisabled;
    previousIsAssistantTurnInProgressRef.current = isAssistantTurnInProgress;
  }, [isAssistantTurnInProgress, isComposerDisabled]);

  const setInputRef = useCallback(
    (input: HTMLTextAreaElement | null) => {
      inputRef.current = input;

      // Skip on mobile: refocusing after a turn re-springs the keyboard, even
      // for the quick-action flow that never focused the input.
      const shouldRefocusInput =
        ((previousIsInputDisabledRef.current && !isComposerDisabled) ||
          (previousIsAssistantTurnInProgressRef.current &&
            !isAssistantTurnInProgress)) &&
        !isHandheld;

      if (input && shouldRefocusInput) {
        input.focus();
      }
    },
    [isAssistantTurnInProgress, isComposerDisabled, isHandheld],
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
      aria-label="Halo"
      className={cn(
        "bg-background flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border shadow/5",
        // Full-bleed on mobile: the drawer owns the edge, so drop the window chrome.
        isHandheld && "rounded-none border-0 shadow-none",
      )}
    >
      <header
        data-in-app-agent-window-drag-handle={
          isHeaderDragHandleEnabled ? "true" : undefined
        }
        className={cn(
          "bg-card flex min-h-11.25 shrink-0 items-center justify-between gap-2 border-b px-3 py-1",
          isHeaderDragHandleEnabled && "cursor-move touch-none",
          // Double-click toggles, so never let it select the title instead.
          !isHandheld && "select-none",
        )}
        onDoubleClick={
          isHandheld
            ? undefined
            : (event) => {
                // The action cluster owns its own double-clicks.
                if (
                  event.target instanceof Element &&
                  event.target.closest("button")
                ) {
                  return;
                }

                onExpandedChange(!isExpanded);
              }
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {conversationTitle ? (
            <p
              className="min-w-0 truncate text-sm font-bold"
              title={conversationTitle}
            >
              {conversationTitle}
            </p>
          ) : (
            <p className="shrink-0 truncate text-sm font-bold" title="Halo">
              Halo
            </p>
          )}
          {titleActions ? (
            <div
              className="flex shrink-0 items-center"
              data-movable-resizable-panel-ignore-drag="true"
            >
              {titleActions}
            </div>
          ) : null}
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
                aria-label="Start new conversation"
              >
                <Plus size="base" color="default" />
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
                    className="relative size-6 shrink-0"
                    // Count lives on the button name, as on the launcher — a
                    // nested badge aria-label is ignored once the parent has one.
                    aria-label={`Conversation history${historyAttentionSuffix}`}
                  >
                    <History size="base" color="default" />
                    {/* Launcher badge, scaled to the 24px trigger. Visual only —
                        accessible name is on the button. */}
                    {historyAttentionCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="bg-primary-accent text-primary-foreground absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full px-1 text-[9px] leading-none font-bold"
                      >
                        {historyAttentionCount > 99
                          ? "99+"
                          : historyAttentionCount}
                      </span>
                    )}
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
                  const activityState = activityByConversationId.get(
                    conversation.id,
                  )?.state;

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
                      {activityState ? (
                        <ConversationActivityIndicator state={activityState} />
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive -mr-1.5 shrink-0"
                        // Deleting is always allowed; it cancels whatever the
                        // conversation was doing rather than refusing.
                        disabled={isConversationInteractionDisabled}
                        aria-label="Delete conversation"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setIsConversationHistoryOpen(false);
                          onDeleteConversation(conversation);
                        }}
                      >
                        <Trash2 size="sm" color="default" />
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
          {/* Mobile is always full-screen, so there is nothing to expand. */}
          {!isHandheld ? (
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
                    <Minimize2 size="base" color="default" />
                  ) : (
                    <Maximize2 size="base" color="default" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isExpanded ? "Collapse window" : "Expand window"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {props.showCloseButton !== false ? (
            <Tooltip delayDuration={100} disableHoverableContent>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  // Full-screen has nothing to minimize into, and with no
                  // drag-to-dismiss this is the only way out.
                  aria-label={isHandheld ? "Close Halo" : "Minimize Halo"}
                  onClick={props.onClose}
                >
                  {isHandheld ? (
                    <X size="base" color="default" />
                  ) : (
                    <Minus size="base" color="default" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isHandheld ? "Close Halo" : "Minimize Halo"}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ConversationScroller
          key={selectedConversationId}
          displayItems={displayItems}
        >
          <div
            className={cn(
              "flex min-h-full w-full flex-col py-4",
              isExpanded && "mx-auto max-w-3xl",
              isExpanded ? "px-0" : "px-3",
            )}
          >
            {/* An empty transcript that is still loading is not an empty
                  conversation. Offering the welcome screen and its quick actions
                  mid-switch flashes the wrong thing and invites a click that
                  would start a turn in the conversation being left behind. */}
            {messages.length === 0 &&
            isSelectedConversationHydrating ? null : messages.length === 0 ? (
              <div className="flex h-full w-full flex-1 flex-col items-center justify-center px-2">
                <div>
                  <HaloIcon variant="emptyState" />
                </div>
                <InAppAgentQuickActionPicker
                  key={`${selectedConversationId ?? "new"}:${quickActionResetKey}`}
                  focusedActions={focusedQuickActions}
                  initialContext={quickActionContext}
                  isDisabled={isSubmitDisabled}
                  onSelectAction={(action, context, position) => {
                    capture("in_app_agent:quick_action_started", {
                      quickActionKey: action.id,
                      quickActionCategory: context,
                      position,
                    });
                    submitInput(action.prompt);
                  }}
                />
              </div>
            ) : null}

            <ol className="flex w-full flex-col gap-1 pb-4">
              {displayItems.map((item, index) => {
                if (item.type === "user") {
                  return (
                    <li
                      key={item.message.id}
                      className={cn(
                        "ml-auto w-fit max-w-[92%]",
                        item.hasPreviousMessage && "mt-3",
                      )}
                    >
                      <InAppAgentMessage
                        role={item.message.role}
                        content={item.message.content}
                        isCompact={!isExpanded}
                      />
                    </li>
                  );
                }

                if (item.type === "activity") {
                  return (
                    <li
                      key={item.key}
                      className={cn("w-full", item.followsUser && "mt-3")}
                    >
                      <AssistantActivityGroup
                        messages={item.messages}
                        startTimestamp={item.startTimestamp}
                        endTimestamp={item.endTimestamp}
                        isCompact={!isExpanded}
                        isInProgress={item.isInProgress}
                        isAwaitingApproval={
                          item.isInProgress && isAwaitingApproval
                        }
                        outcome={
                          index === lastSettledActivityIndex
                            ? (executionUi.activityOutcome ?? "worked")
                            : "worked"
                        }
                      />
                    </li>
                  );
                }

                if (item.type === "questionnaire") {
                  return (
                    <li key={item.key} className="w-full">
                      <InAppAgentQuestionnaireSummary answers={item.answers} />
                    </li>
                  );
                }

                const message = item.message;
                const feedbackRunId =
                  message.content.type === "text" && item.isFinalAnswer
                    ? message.runId
                    : undefined;

                return (
                  <li
                    key={message.id}
                    className={cn("w-full", item.followsUser && "mt-3")}
                  >
                    <InAppAgentMessage
                      role={message.role}
                      content={message.content}
                      isCompact={!isExpanded}
                      isFeedbackDisabled={isConversationInteractionDisabled}
                      isFinalAnswer={item.isFinalAnswer}
                      timestamp={message.timestamp}
                      onSubmitFeedback={
                        feedbackRunId
                          ? (params) =>
                              onSubmitFeedback({
                                messageId:
                                  message.feedbackMessageId ?? message.id,
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
          </div>
        </ConversationScroller>
        {pendingToolCalls.length > 0 ? (
          <div className="shrink-0 px-1.5 pt-1.5 pb-2">
            <div
              className={cn(
                "flex flex-col gap-2",
                isExpanded && "mx-auto max-w-3xl",
              )}
            >
              {pendingToolCalls.map((tool, index) => (
                <PendingToolCallCard
                  key={`${tool.approval?.id ?? tool.name}-${index}`}
                  tool={tool}
                  isCompact={!isExpanded}
                  isDisabled={isRateLimited}
                  onApproveToolCall={onApproveToolCall}
                  onAlwaysAllowToolCall={onAlwaysAllowToolCall}
                  onAnswerQuestionnaire={onAnswerQuestionnaire}
                  onRejectToolCall={onRejectToolCall}
                />
              ))}
            </div>
          </div>
        ) : null}
        {backgroundNotice ? (
          <InAppAgentNotice
            icon={
              backgroundNotice.tone === "warning" ? (
                <TriangleAlert aria-hidden="true" size="sm" />
              ) : (
                <Info aria-hidden="true" size="sm" />
              )
            }
            isExpanded={isExpanded}
            role="status"
            tone={backgroundNotice.tone === "warning" ? "warning" : "neutral"}
          >
            <span title={backgroundNotice.text}>{backgroundNotice.text}</span>
          </InAppAgentNotice>
        ) : null}
        {error?.type === "generic" && (
          <InAppAgentIssueNotice isExpanded={isExpanded} />
        )}
        {backgroundHint.isVisible && props.onClose ? (
          <InAppAgentBackgroundHint
            isExpanded={isExpanded}
            onMinimize={() => {
              backgroundHint.hide();
              props.onClose?.();
            }}
          />
        ) : null}
        {error?.type === "rate_limit" && (
          <div className={cn(isAssistantTurnInProgress && "pt-2")}>
            <InAppAgentRateLimitError error={error} isExpanded={isExpanded} />
          </div>
        )}
        {isAssistantTurnInProgress && pendingToolCalls.length === 0 ? (
          <div className="pointer-events-none relative mx-auto h-px w-[calc(100%-1.5rem)] max-w-[calc(48rem-0.75rem)] shrink-0 select-none">
            <div className="absolute top-0 h-4 w-full -translate-y-full overflow-hidden">
              <div className="absolute top-0 h-12 w-full bg-radial from-(--color-3) to-transparent to-60% bg-center opacity-25" />
            </div>
            <div className="absolute bottom-0 left-0 h-px w-full overflow-hidden">
              <div
                aria-hidden="true"
                className={cn("h-[4rem]", styles.loadingGradient)}
              />
              {/* Match the assistant surface so the loading animation fades at both edges. */}
              <div className="from-background absolute top-0 right-0 h-full w-1/2 bg-linear-to-l to-transparent" />
              <div className="from-background absolute top-0 left-0 h-full w-1/2 bg-linear-to-r to-transparent" />
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            "p-1.5",
            (isExpanded || isAssistantTurnInProgress) && "pt-0",
          )}
        >
          {/* The composer separates from the transcript by elevation, not by a
              rule: one hairline edge, a lifted surface, and a footer band a
              step off the input. `overflow-hidden` keeps that band inside the
              rounded corners. */}
          <form
            className={cn(
              "border-border bg-card focus-within:border-border-contrast relative flex w-full cursor-text flex-col overflow-hidden rounded-md border shadow-sm transition-colors",
              isExpanded && "mx-auto max-w-3xl",
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
              autoFocus={!isExpanded && !isHandheld}
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
              disabled={isComposerDisabled}
              aria-label="Message Halo"
              placeholder={
                hasSettledAssistantReply
                  ? "Reply..."
                  : "Let me know what I can do for you..."
              }
              rows={1}
              className="placeholder:text-muted-foreground max-h-40 min-h-9 w-full resize-none overflow-y-auto border-none bg-transparent px-3 pt-2 pb-2 text-sm leading-5 shadow-none ring-0 outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="bg-muted flex min-h-9 w-full items-center justify-between gap-2 px-2 py-1.5">
              <p className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                <Info aria-hidden="true" size="sm" />
                <span className="truncate" title={screenContextNotice}>
                  {screenContextNotice}
                </span>
              </p>
              {canStopRun ? (
                <Button
                  type="button"
                  size="icon-sm"
                  className="w-8 shrink-0 rounded-full"
                  aria-label={isCancellingRun ? "Stopping run" : "Stop run"}
                  variant="outline"
                  disabled={isCancellingRun}
                  onClick={() => {
                    executionStop?.onStop();
                  }}
                >
                  <Square
                    size="base"
                    color="muted"
                    __rawClassName="fill-current"
                  />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon-sm"
                  className="w-8 shrink-0 rounded-full"
                  aria-label="Send message"
                  disabled={isSubmitDisabled || !input.trim()}
                >
                  <SendHorizontal size="base" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

type PendingToolCallCardProps = {
  tool: InAppAgentToolCallContent;
  isCompact: boolean;
  isDisabled: boolean;
} & Pick<
  InAppAgentWindowProps,
  | "onApproveToolCall"
  | "onAlwaysAllowToolCall"
  | "onAnswerQuestionnaire"
  | "onRejectToolCall"
>;

function PendingToolCallCard({
  tool,
  isCompact,
  isDisabled,
  onApproveToolCall,
  onAlwaysAllowToolCall,
  onAnswerQuestionnaire,
  onRejectToolCall,
}: PendingToolCallCardProps) {
  const isQuestionnaire = tool.name === IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME;
  const questions = useMemo(
    () => (isQuestionnaire ? parseQuestionnaireQuestions(tool.args) : null),
    [isQuestionnaire, tool.args],
  );

  if (tool.approval && questions) {
    return (
      <PendingQuestionnaireCard
        approval={tool.approval}
        questions={questions}
        isDisabled={isDisabled}
        onAnswerQuestionnaire={onAnswerQuestionnaire}
      />
    );
  }

  // A questionnaire with malformed questions cannot be answered, only declined.
  if (isQuestionnaire) {
    return (
      <InAppAgentToolCallCard
        tool={tool}
        isCompact={isCompact}
        isDisabled={isDisabled}
        onRejectToolCall={onRejectToolCall}
      />
    );
  }

  return (
    <InAppAgentToolCallCard
      tool={tool}
      isCompact={isCompact}
      isDisabled={isDisabled}
      onApproveToolCall={onApproveToolCall}
      onAlwaysAllowToolCall={onAlwaysAllowToolCall}
      onRejectToolCall={onRejectToolCall}
    />
  );
}

type PendingQuestionnaireCardProps = {
  approval: NonNullable<InAppAgentToolCallContent["approval"]>;
  questions: readonly InAppAgentQuestionnaireQuestion[];
  isDisabled: boolean;
} & Pick<InAppAgentWindowProps, "onAnswerQuestionnaire">;

function PendingQuestionnaireCard({
  approval,
  questions,
  isDisabled,
  onAnswerQuestionnaire,
}: PendingQuestionnaireCardProps) {
  const handleSubmit = (answers: InAppAgentQuestionnaireAnswers) =>
    onAnswerQuestionnaire(approval.id, answers);

  return (
    <InAppAgentQuestionnaireCard
      questions={questions}
      isSubmitting={approval.status === "submitting"}
      isDisabled={isDisabled}
      onSubmit={handleSubmit}
    />
  );
}
