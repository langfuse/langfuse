import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  EventType,
  HttpAgent,
  type AbstractAgent,
  type AgentSubscriber,
} from "@ag-ui/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import useSessionStorage from "@/src/components/useSessionStorage";
import { env } from "@/src/env.mjs";
import {
  createInAppAgentConversationId,
  createInAppAgentMessageId,
  createInAppAgentRunId,
} from "@langfuse/shared/in-app-agent";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@langfuse/shared/in-app-agent";
import {
  AgUiMessageSchema,
  dropEmptyAssistantMessages,
  dropUnpairedAssistantToolCalls,
  isActiveInAppAgentRunStatus,
  type AgUiMessage,
  type InAppAgentMessageFeedback,
  type InAppAgentMessageFeedbackValue,
  type InAppAgentRuntimeState,
  type InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import {
  createInAppAgentDisplayState,
  deserializeInAppAgentDisplayState,
  projectInAppAgentMessagesForDisplay,
  recordInAppAgentMessagesForDisplay,
  recordInAppAgentToolCallForDisplay,
  type InAppAgentDisplayState,
} from "@/src/features/in-app-agent/lib/display";
import { InAppAgentBackgroundClient } from "@/src/features/in-app-agent/lib/backgroundAgentClient";
import { useInAppAgentBackgroundExecutionEnabled } from "@/src/features/in-app-agent/lib/backgroundExecutionFlag";
import {
  BackgroundExecutionSessionController,
  isCancellableBackgroundRun,
  parseInAppAgentInterruptEvent,
  type AgentInput,
  type BackgroundExecutionRunView,
  type BackgroundExecutionSession,
  type BackgroundExecutionView,
} from "@/src/features/in-app-agent/lib/backgroundExecutionSession";
import type { InAppAgentError } from "@/src/features/in-app-agent/components/utils/utils";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { api } from "@/src/utils/api";
import {
  createInAppAgentMessageEntryPointContext,
  createInAppAgentQuickActionAttributionContext,
  createInAppAgentScreenContext,
  createInAppAgentUserContext,
  type InAppAgentMessageEntryPoint,
} from "@/src/features/in-app-agent/context";
import type {
  InAppAgentQuickActionAttribution,
  InAppAgentSubmitOptions,
} from "@/src/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  getInAppAgentError,
  isInAppAgentRateLimited,
  type InAppAiAgentMessage,
} from "@/src/features/in-app-agent/components/utils/utils";
import { evaluateSetStateAction } from "@/src/utils/evaluate-set-state-action";
import { InAppAgentDisabledDialog } from "@/src/features/in-app-agent/components/InAppAgentDisabledDialog";
import {
  getCompletedToolCalls,
  performToolSideEffectsForCompletedToolCalls,
} from "@/src/features/in-app-agent/components/utils/side-effects";

const SELECTED_CONVERSATION_STORAGE_KEY_PREFIX =
  "langfuse:in-app-ai-agent-selected-conversation";
const OPEN_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-open";
const FEEDBACK_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-feedback";
const SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE =
  "Sandbox-enabled conversations become read-only after 8 hours. Start a new conversation to continue.";
const EMPTY_MESSAGES: AgUiMessage[] = [];
const EMPTY_BACKGROUND_VIEW: BackgroundExecutionView = {
  messages: EMPTY_MESSAGES,
  displayState: createInAppAgentDisplayState(),
  liveMessageRevision: 0,
  eventCursor: -1,
  currentRun: null,
  pendingToolApprovals: [],
  cancelStatus: "idle",
  attachment: { status: "detached" },
};

export type InAppAgentEntryPoint =
  | "top_nav"
  | "keyboard_shortcut"
  | "dashboard_widget";

const getConversationAgentState = (
  projectId: string,
  conversationId: string,
  isNewConversation: boolean,
): InAppAgentRuntimeState =>
  isNewConversation
    ? { type: "newConversation", projectId }
    : { type: "existingConversation", projectId, conversationId };

function useBackgroundExecutionView(
  session: BackgroundExecutionSession | null,
  bootstrapView: BackgroundExecutionView,
): BackgroundExecutionView {
  const subscribe = useCallback(
    (listener: () => void) =>
      session ? session.subscribe(listener) : () => undefined,
    [session],
  );
  const getSnapshot = useCallback(
    () => session?.getSnapshot() ?? bootstrapView,
    [bootstrapView, session],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const NOOP_CONTEXT: InAppAiAgentContextType = {
  isAvailable: false,
  open: false,
  setOpen: () => undefined,
  openAssistant: () => false,
  isExpanded: false,
  setIsExpanded: () => undefined,
  isRunning: false,
  isSubmitting: false,
  pendingToolApprovals: [],
  isSelectedConversationHydrating: false,
  execution: { type: "foreground" },
  error: null,
  messages: [],
  liveMessageVersion: 0,
  conversations: [],
  hasMoreConversations: false,
  isLoadingMoreConversations: false,
  selectedConversationId: undefined,
  selectedConversationIsWriteLocked: false,
  loadMoreConversations: () => undefined,
  invalidateConversations: () => undefined,
  selectConversation: () => undefined,
  deleteConversation: async () => undefined,
  submit: async () => false,
  approveToolCall: async () => undefined,
  rejectToolCall: async () => undefined,
  submitFeedback: async () => undefined,
};

type InAppAiAgentFeedbackByConversationId = Record<
  string,
  Record<string, InAppAgentMessageFeedback>
>;

export type InAppAgentPendingToolApproval = {
  id: string;
  approvalRequest: InAppAgentToolApprovalRequest;
  status: "pending" | "submitting";
  // Present for approvals restored from persisted background events.
  runId?: string;
};

export type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
  isWriteLocked: boolean;
};

type InAppAiAgentExecution =
  | { type: "foreground" }
  | {
      type: "background";
      run: BackgroundExecutionRunView | null;
      isCancelling: boolean;
      cancel: () => void;
    };

type InAppAiAgentContextType = {
  isAvailable: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** Returns false and opens the disabled dialog when AI features are off. */
  openAssistant: (source: InAppAgentEntryPoint) => boolean;
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  isRunning: boolean;
  isSubmitting: boolean;
  pendingToolApprovals: InAppAgentPendingToolApproval[];
  isSelectedConversationHydrating: boolean;
  execution: InAppAiAgentExecution;
  error: InAppAgentError | null;
  messages: InAppAiAgentMessage[];
  liveMessageVersion: number;
  conversations: InAppAiAgentConversation[];
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  selectedConversationId: string | undefined;
  selectedConversationIsWriteLocked: boolean;
  loadMoreConversations: () => void;
  invalidateConversations: () => void;
  selectConversation: (conversationId: string | null) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  submit: (
    content: string,
    options?: InAppAgentSubmitOptions,
  ) => Promise<boolean>;
  approveToolCall: (approvalId: string) => Promise<void>;
  rejectToolCall: (approvalId: string) => Promise<void>;
  submitFeedback: (params: {
    messageId: string;
    runId: string;
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
};

const InAppAiAgentContext = createContext<InAppAiAgentContextType | null>(null);

export type InAppAiAgentProviderProps = PropsWithChildren<{
  defaultOpen?: boolean;
}>;

export function InAppAiAgentProvider({
  children,
  defaultOpen = false,
}: InAppAiAgentProviderProps) {
  const router = useRouter();
  const routerProjectId = router.query.projectId;
  const projectId =
    typeof routerProjectId === "string" ? routerProjectId : undefined;
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");

  if (!projectId || !hasInAppAgentEntitlement) {
    return <>{children}</>;
  }

  return (
    <InAppAiAgentProjectProvider
      key={projectId}
      projectId={projectId}
      defaultOpen={defaultOpen}
    >
      {children}
    </InAppAiAgentProjectProvider>
  );
}

function InAppAiAgentProjectProvider({
  children,
  projectId,
  defaultOpen,
}: InAppAiAgentProviderProps & {
  projectId: string;
}) {
  const [open, setOpen] = useSessionStorage<boolean>(
    `${OPEN_STORAGE_KEY_PREFIX}:${projectId}`,
    defaultOpen ?? false,
  );

  return (
    <InAppAiAgentProviderInner
      projectId={projectId}
      open={open}
      setOpen={setOpen}
    >
      {children}
    </InAppAiAgentProviderInner>
  );
}

type InAppAiAgentProviderInnerProps = PropsWithChildren<{
  projectId: string;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}>;

function InAppAiAgentProviderInner({
  children,
  projectId,
  open,
  setOpen,
}: InAppAiAgentProviderInnerProps) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);
  const [_selectedConversationId, setSelectedConversationId] =
    useSessionStorage<string | null>(
      `${SELECTED_CONVERSATION_STORAGE_KEY_PREFIX}:${projectId}`,
      null,
    );
  const [feedbackByConversationId, setFeedbackByConversationId] =
    useSessionStorage<InAppAiAgentFeedbackByConversationId>(
      `${FEEDBACK_STORAGE_KEY_PREFIX}:${projectId}`,
      {},
    );
  const [foregroundMessages, setForegroundMessages] = useState<AgUiMessage[]>(
    [],
  );
  // Only live AG-UI publications increment this version. The display smoother
  // uses it to distinguish stream updates from history hydration, including
  // updates where the agent mutates message objects in place.
  const [foregroundLiveMessageVersion, setForegroundLiveMessageVersion] =
    useState(0);
  const [displayState, setDisplayState] = useState(
    createInAppAgentDisplayState,
  );
  const [foregroundPendingToolApprovals, setForegroundPendingToolApprovals] =
    useState<InAppAgentPendingToolApproval[]>([]);
  const foregroundPendingToolApprovalsRef = useRef<
    InAppAgentPendingToolApproval[]
  >([]);
  const [isForegroundRunning, setIsForegroundRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingEventIds, setLoadingEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<InAppAgentError | null>(null);
  const agentRef = useRef<AbstractAgent | null>(null);
  const backgroundSessionRef = useRef<BackgroundExecutionSession | null>(null);
  const [backgroundSession, setBackgroundSession] =
    useState<BackgroundExecutionSession | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const toolCallNamesRef = useRef(new Map<string, string>());
  const handledToolCallIdsRef = useRef(new Set<string>());
  const backgroundExecutionEnabled = useInAppAgentBackgroundExecutionEnabled();
  const intentionalAbortRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const runInFlightRef = useRef(false);
  const subscriptionRef = useRef<ReturnType<AbstractAgent["subscribe"]> | null>(
    null,
  );

  const conversationListQuery =
    api.inAppAgent.listConversations.useInfiniteQuery(
      { projectId },
      {
        enabled: open,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );
  const conversationQuery = api.inAppAgent.getConversation.useQuery(
    {
      projectId,
      conversationId: _selectedConversationId ?? "",
    },
    {
      enabled: open && Boolean(_selectedConversationId) && !isSubmitting,
    },
  );
  const deleteConversationMutation =
    api.inAppAgent.deleteConversation.useMutation();
  const feedbackMutation = api.inAppAgent.submitFeedback.useMutation();
  const startRunMutation = api.inAppAgent.startRun.useMutation();
  const cancelRunMutation = api.inAppAgent.cancelRun.useMutation();
  const decideToolApprovalMutation =
    api.inAppAgent.decideToolApproval.useMutation();
  const isSelectedConversationNotFound =
    conversationQuery.error?.data?.code === "NOT_FOUND";
  const selectedConversationId = isSelectedConversationNotFound
    ? null
    : _selectedConversationId;

  const conversations = useMemo(
    () =>
      conversationListQuery.data?.pages.flatMap((page) => page.conversations) ??
      [],
    [conversationListQuery.data?.pages],
  );
  const hasMoreConversations = conversationListQuery.hasNextPage === true;
  const isLoadingMoreConversations = conversationListQuery.isFetchingNextPage;
  const selectedConversationIsWriteLocked =
    conversationQuery.data?.conversation.isWriteLocked ?? false;

  const bootstrapBackgroundView = useMemo<BackgroundExecutionView>(() => {
    if (
      conversationQuery.data?.conversation.id !== selectedConversationId ||
      !conversationQuery.data
    ) {
      return EMPTY_BACKGROUND_VIEW;
    }

    const latestRun = conversationQuery.data.latestRun;
    return {
      messages: conversationQuery.data.messages.filter(
        isAgentConversationMessage,
      ),
      displayState: deserializeInAppAgentDisplayState(
        conversationQuery.data.displayState,
      ),
      liveMessageRevision: 0,
      eventCursor: conversationQuery.data.eventCursor,
      currentRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            errorCode: latestRun.errorCode,
            cancelRequested: latestRun.cancelRequested,
          }
        : null,
      pendingToolApprovals: conversationQuery.data.pendingToolApprovals.map(
        (approval) => ({ ...approval, status: "pending" as const }),
      ),
      cancelStatus: "idle",
      attachment: { status: "detached" },
    };
  }, [conversationQuery.data, selectedConversationId]);
  const backgroundExecutionView = useBackgroundExecutionView(
    backgroundSession,
    bootstrapBackgroundView,
  );
  const currentBackgroundRun = backgroundExecutionEnabled
    ? backgroundExecutionView.currentRun
    : null;
  const isBackgroundRunning =
    backgroundExecutionEnabled &&
    (backgroundExecutionView.attachment.status === "attaching" ||
      backgroundExecutionView.attachment.status === "attached" ||
      Boolean(
        currentBackgroundRun &&
        isActiveInAppAgentRunStatus(currentBackgroundRun.status),
      ));
  const isRunning = backgroundExecutionEnabled
    ? isBackgroundRunning
    : isForegroundRunning;
  const effectiveError =
    backgroundExecutionEnabled &&
    backgroundExecutionView.attachment.status === "error"
      ? getInAppAgentError(backgroundExecutionView.attachment.error)
      : error;
  const liveMessageVersion = backgroundExecutionEnabled
    ? backgroundExecutionView.liveMessageRevision
    : foregroundLiveMessageVersion;

  const effectivePendingToolApprovals = useMemo(() => {
    if (!backgroundExecutionEnabled) {
      return foregroundPendingToolApprovals;
    }

    return backgroundExecutionView.pendingToolApprovals.map(
      ({ runId, approvalRequest, status }): InAppAgentPendingToolApproval => ({
        id: approvalRequest.toolCallId,
        approvalRequest,
        status,
        runId,
      }),
    );
  }, [
    backgroundExecutionEnabled,
    backgroundExecutionView.pendingToolApprovals,
    foregroundPendingToolApprovals,
  ]);
  /**
   * Messages and their display sidecar always come from the same source, so the
   * projection below can never fold live messages against persisted state (or
   * the reverse). `isSettled` marks a transcript the server has finished
   * writing, which is the only case where pruning is safe.
   *
   * A run paused on an approval needs no special case: `human-in-the-loop.ts`
   * emits the tool call's START and RESULT in one batch when the decision is
   * resolved, so a pending approval has no tool call yet and a resolved one is
   * never unpaired.
   */
  const currentSource = useMemo((): {
    messages: readonly AgUiMessage[];
    displayState: InAppAgentDisplayState;
    isSettled: boolean;
  } => {
    if (isSelectedConversationNotFound) {
      return {
        messages: EMPTY_MESSAGES,
        displayState: EMPTY_BACKGROUND_VIEW.displayState,
        isSettled: true,
      };
    }

    if (backgroundExecutionEnabled) {
      return {
        messages: backgroundExecutionView.messages,
        displayState: backgroundExecutionView.displayState,
        isSettled: !isBackgroundRunning,
      };
    }

    const storedMessages =
      conversationQuery.data?.conversation.id === selectedConversationId
        ? conversationQuery.data.messages.filter(isAgentConversationMessage)
        : undefined;

    if (
      !isRunning &&
      storedMessages &&
      foregroundMessages.length <= storedMessages.length
    ) {
      return {
        messages: storedMessages,
        displayState: deserializeInAppAgentDisplayState(
          conversationQuery.data?.displayState,
        ),
        isSettled: true,
      };
    }

    return {
      messages: foregroundMessages,
      displayState,
      isSettled: false,
    };
  }, [
    backgroundExecutionEnabled,
    backgroundExecutionView.displayState,
    backgroundExecutionView.messages,
    conversationQuery.data,
    displayState,
    foregroundMessages,
    isBackgroundRunning,
    isRunning,
    isSelectedConversationNotFound,
    selectedConversationId,
  ]);
  const messagesWithUiState = useMemo(() => {
    // Unpaired tool calls and empty assistant messages are pruned only once the
    // transcript is settled. A live seed must keep them: an in-flight tool call
    // needs to be present for its arriving result to attach to.
    const prunedMessages = currentSource.isSettled
      ? dropEmptyAssistantMessages(
          dropUnpairedAssistantToolCalls(currentSource.messages),
        )
      : currentSource.messages;
    const messagesWithRunId = backgroundExecutionEnabled
      ? attachActiveRunIdToAssistantMessages(
          prunedMessages,
          currentBackgroundRun?.id ?? null,
        )
      : prunedMessages;
    const messagesWithFeedback = mergeMessagesWithFeedback(
      messagesWithRunId,
      selectedConversationId
        ? feedbackByConversationId[selectedConversationId]
        : undefined,
    );
    const unresolvedActiveRunToolCallIds = new Set<string>();
    if (
      backgroundExecutionEnabled &&
      currentBackgroundRun &&
      isActiveInAppAgentRunStatus(currentBackgroundRun.status)
    ) {
      const resultToolCallIds = new Set(
        prunedMessages.flatMap((message) =>
          message.role === "tool" ? [message.toolCallId] : [],
        ),
      );
      for (const message of prunedMessages) {
        if (
          message.role !== "assistant" ||
          message.runId !== currentBackgroundRun.id
        ) {
          continue;
        }
        for (const toolCall of message.toolCalls ?? []) {
          if (!resultToolCallIds.has(toolCall.id)) {
            unresolvedActiveRunToolCallIds.add(toolCall.id);
          }
        }
      }
    }
    const displayMessages = projectInAppAgentMessagesForDisplay(
      messagesWithFeedback,
      currentSource.displayState,
    );

    return displayMessages.map((message) => {
      if (message.role === "reasoning") {
        return { ...message, isLoading: loadingEventIds.has(message.id) };
      }

      if (message.role !== "assistant") {
        return message;
      }

      return {
        ...message,
        isLoading:
          loadingEventIds.has(message.id) ||
          (message.toolCalls?.some(
            (toolCall) =>
              toolCall.function.name !== IN_APP_AGENT_REDIRECT_TOOL_NAME &&
              (loadingEventIds.has(toolCall.id) ||
                unresolvedActiveRunToolCallIds.has(toolCall.id)),
          ) ??
            false),
      };
    });
  }, [
    backgroundExecutionEnabled,
    currentBackgroundRun,
    feedbackByConversationId,
    currentSource,
    loadingEventIds,
    selectedConversationId,
  ]);
  const fetchNextConversationsPage = conversationListQuery.fetchNextPage;
  const loadMoreConversations = useCallback(() => {
    if (!hasMoreConversations || isLoadingMoreConversations) {
      return;
    }

    fetchNextConversationsPage().catch((error) => {
      const errorMessage = getAgentErrorMessage(error);
      showErrorToast("Failed to load conversations", errorMessage);
      console.error("Failed to load in-app agent conversations", error);
    });
  }, [
    fetchNextConversationsPage,
    hasMoreConversations,
    isLoadingMoreConversations,
  ]);
  const invalidateConversations = useCallback(
    () => utils.inAppAgent.listConversations.invalidate({ projectId }),
    [projectId, utils.inAppAgent.listConversations],
  );

  useEffect(() => {
    if (!conversationListQuery.error) {
      return;
    }

    const errorMessage = getAgentErrorMessage(conversationListQuery.error);
    showErrorToast("Failed to load conversations", errorMessage);
    console.error("Failed to load in-app agent conversations", {
      error: conversationListQuery.error,
      projectId,
    });
  }, [conversationListQuery.error, projectId]);

  const isSelectedConversationHydrating =
    Boolean(selectedConversationId) &&
    conversationQuery.isLoading &&
    !conversationQuery.data;
  const updatePendingToolApprovals = useCallback(
    (
      updater: (
        currentApprovals: InAppAgentPendingToolApproval[],
      ) => InAppAgentPendingToolApproval[],
    ) => {
      const nextApprovals = updater(foregroundPendingToolApprovalsRef.current);
      foregroundPendingToolApprovalsRef.current = nextApprovals;
      setForegroundPendingToolApprovals(nextApprovals);
    },
    [],
  );
  const updateLoadingEvent = useCallback(
    (eventId: string, isLoading: boolean) => {
      setLoadingEventIds((currentIds) => {
        if (currentIds.has(eventId) === isLoading) {
          return currentIds;
        }

        const nextIds = new Set(currentIds);
        if (isLoading) {
          nextIds.add(eventId);
        } else {
          nextIds.delete(eventId);
        }
        return nextIds;
      });
    },
    [],
  );
  const clearLoadingEvents = useCallback(() => {
    setLoadingEventIds((currentIds) =>
      currentIds.size > 0 ? new Set() : currentIds,
    );
  }, []);
  const publishLiveMessages = useCallback(
    (messages: readonly AgUiMessage[]) => {
      setForegroundMessages([...messages]);
      setForegroundLiveMessageVersion((currentVersion) => currentVersion + 1);
    },
    [],
  );
  const recordAgentMessagesForDisplay = useCallback(
    (messages: AgUiMessage[]) => {
      setDisplayState((currentState) =>
        recordInAppAgentMessagesForDisplay(currentState, messages),
      );
    },
    [],
  );
  const publishAgentMessages = useCallback(
    (agentMessages: readonly unknown[]) => {
      const nextMessages = agentMessages.filter(isAgentConversationMessage);
      recordAgentMessagesForDisplay(nextMessages);

      publishLiveMessages(
        attachActiveRunIdToAssistantMessages(
          nextMessages,
          activeRunIdRef.current,
        ),
      );
    },
    [publishLiveMessages, recordAgentMessagesForDisplay],
  );
  const resetAgent = useCallback(() => {
    if (agentRef.current?.isRunning) {
      intentionalAbortRef.current = true;
    }

    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
    backgroundSessionRef.current?.dispose();
    backgroundSessionRef.current = null;
    setBackgroundSession(null);
    if (!backgroundExecutionEnabled) {
      agentRef.current?.abortRun();
    }
    agentRef.current = null;
    activeRunIdRef.current = null;
    toolCallNamesRef.current.clear();
    handledToolCallIdsRef.current.clear();
    setDisplayState(createInAppAgentDisplayState());
    foregroundPendingToolApprovalsRef.current = [];
    setForegroundPendingToolApprovals([]);
    clearLoadingEvents();
  }, [backgroundExecutionEnabled, clearLoadingEvents]);

  useEffect(() => {
    return () => {
      resetAgent();
    };
  }, [resetAgent]);

  const rateLimitRetryAt = error?.type === "rate_limit" ? error.retryAt : null;

  useEffect(() => {
    if (rateLimitRetryAt === null) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        setError((currentError) => {
          if (
            currentError?.type !== "rate_limit" ||
            currentError.retryAt !== rateLimitRetryAt
          ) {
            return currentError;
          }

          return null;
        });
      },
      Math.max(0, rateLimitRetryAt - Date.now()),
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [rateLimitRetryAt]);

  const createSharedAgentSubscriber = useCallback(
    (
      options: {
        reportRunError?: boolean;
        /**
         * Foreground only. The background session owns its own display state,
         * so it must not also feed the provider's foreground copy.
         */
        recordDisplayState?: boolean;
      } = {},
    ) =>
      ({
        onRunStartedEvent: ({
          event,
          messages: runMessages,
        }: {
          event: unknown;
          messages: readonly unknown[];
        }) => {
          if (options.recordDisplayState !== false) {
            setDisplayState((currentState) =>
              recordInAppAgentMessagesForDisplay(
                currentState,
                runMessages.filter(isAgentConversationMessage),
              ),
            );
          }

          if (
            typeof event === "object" &&
            event !== null &&
            "runId" in event &&
            typeof event.runId === "string"
          ) {
            activeRunIdRef.current = event.runId;
          }
        },
        onEvent: ({ event }) => {
          if (
            event.type === EventType.REASONING_MESSAGE_START ||
            event.type === EventType.TEXT_MESSAGE_START
          ) {
            updateLoadingEvent(event.messageId, true);
            return;
          }

          if (
            event.type === EventType.REASONING_MESSAGE_END ||
            event.type === EventType.TEXT_MESSAGE_END
          ) {
            updateLoadingEvent(event.messageId, false);
            return;
          }

          if (event.type === EventType.TOOL_CALL_START) {
            toolCallNamesRef.current.set(event.toolCallId, event.toolCallName);
            if (options.recordDisplayState !== false) {
              setDisplayState((currentState) =>
                recordInAppAgentToolCallForDisplay(
                  currentState,
                  event.toolCallId,
                  event.parentMessageId,
                ),
              );
            }

            updateLoadingEvent(event.toolCallId, true);
            return;
          }

          // TOOL_CALL_END only finishes argument streaming. The tool remains
          // active until its result arrives.
          if (event.type === EventType.TOOL_CALL_RESULT) {
            updateLoadingEvent(event.toolCallId, false);
            return;
          }

          if (
            event.type === EventType.RUN_FINISHED ||
            event.type === EventType.RUN_ERROR
          ) {
            clearLoadingEvents();
          }
        },
        onToolCallResultEvent: ({ event }) => {
          const toolCallId = String(event.toolCallId);
          const toolName = toolCallNamesRef.current.get(toolCallId);
          toolCallNamesRef.current.delete(toolCallId);
          if (toolName) {
            performToolSideEffectsForCompletedToolCalls({
              toolCalls: [{ toolCallId, toolName, toolError: event.error }],
              handledToolCallIds: handledToolCallIdsRef.current,
              utils,
            }).catch((error: unknown) => {
              console.error(
                "Failed to invalidate tRPC routes after in-app agent tool call",
                { error, toolName },
              );
            });
          }
        },
        onRunErrorEvent: ({ event }) => {
          if (intentionalAbortRef.current) {
            return;
          }

          setError(getInAppAgentError(event));
          if (options.reportRunError !== false) {
            console.error("In-app agent drawer run error", event);
          }
        },
      }) satisfies AgentSubscriber,
    [clearLoadingEvents, updateLoadingEvent, utils],
  );
  const ensureSubscription = useCallback(
    (agent: AbstractAgent) => {
      if (
        subscriptionRef.current ||
        agent instanceof InAppAgentBackgroundClient
      ) {
        return;
      }

      const sharedSubscriber = createSharedAgentSubscriber();
      subscriptionRef.current = agent.subscribe({
        ...sharedSubscriber,
        onCustomEvent: ({ event }) => {
          const approvalRequest = parseInAppAgentInterruptEvent(event);

          if (!approvalRequest) {
            return;
          }

          const approval: InAppAgentPendingToolApproval = {
            id: approvalRequest.toolCallId,
            approvalRequest,
            status: "pending",
          };

          updatePendingToolApprovals((currentApprovals) => {
            const existingIndex = currentApprovals.findIndex(
              (currentApproval) => currentApproval.id === approval.id,
            );

            if (existingIndex === -1) {
              return [...currentApprovals, approval];
            }

            const nextApprovals = [...currentApprovals];
            nextApprovals[existingIndex] = approval;
            return nextApprovals;
          });
        },
        onToolCallResultEvent: (params) => {
          sharedSubscriber.onToolCallResultEvent(params);
          updatePendingToolApprovals((currentApprovals) =>
            currentApprovals.filter(
              (approval) =>
                approval.approvalRequest.toolCallId !== params.event.toolCallId,
            ),
          );
        },
        onMessagesChanged: ({ messages }) => {
          publishAgentMessages(messages);
        },
        onStateChanged: ({ messages }) => {
          publishAgentMessages(messages);
        },
      });
    },
    [
      createSharedAgentSubscriber,
      publishAgentMessages,
      updatePendingToolApprovals,
    ],
  );

  const releaseSubmitLock = useCallback(() => {
    submitInFlightRef.current = false;
    setIsSubmitting(false);
  }, []);

  const getOrCreateAgent = useCallback(
    (
      conversationId: string,
      initialMessages: AgUiMessage[],
      isNewConversation: boolean,
    ) => {
      if (agentRef.current?.threadId === conversationId) {
        return agentRef.current;
      }

      resetAgent();

      const initialState = getConversationAgentState(
        projectId,
        conversationId,
        isNewConversation,
      );

      const initialCursor =
        conversationQuery.data?.conversation.id === conversationId
          ? conversationQuery.data.eventCursor
          : -1;
      const initialRun =
        conversationQuery.data?.conversation.id === conversationId &&
        conversationQuery.data.latestRun
          ? {
              id: conversationQuery.data.latestRun.id,
              status: conversationQuery.data.latestRun.status,
              errorCode: conversationQuery.data.latestRun.errorCode,
              cancelRequested: conversationQuery.data.latestRun.cancelRequested,
            }
          : null;

      const agent = backgroundExecutionEnabled
        ? new InAppAgentBackgroundClient({
            projectId,
            conversationId,
            threadId: conversationId,
            initialMessages,
            initialState,
            cursor: initialCursor,
            startRun: (params) =>
              startRunMutation.mutateAsync({
                projectId,
                conversationId,
                message: params.message,
                context: [...params.context],
              }),
          })
        : new HttpAgent({
            url: getInAppAgentUrl(),
            threadId: conversationId,
            initialMessages,
            initialState,
          });

      agentRef.current = agent;

      if (agent instanceof InAppAgentBackgroundClient) {
        const nextBackgroundSession = new BackgroundExecutionSessionController({
          agent,
          // The session owns background display state; the shared subscriber
          // must not also record into the foreground-only provider state.
          subscriber: createSharedAgentSubscriber({
            reportRunError: false,
            recordDisplayState: false,
          }),
          initialView: {
            messages: initialMessages,
            displayState: deserializeInAppAgentDisplayState(
              conversationQuery.data?.conversation.id === conversationId
                ? conversationQuery.data.displayState
                : undefined,
            ),
            eventCursor: initialCursor,
            currentRun: initialRun,
          },
          hydrate: async () => {
            const snapshot = await utils.inAppAgent.getConversation.fetch({
              projectId,
              conversationId,
            });

            return {
              messages: snapshot.messages.filter(isAgentConversationMessage),
              displayState: deserializeInAppAgentDisplayState(
                snapshot.displayState,
              ),
              eventCursor: snapshot.eventCursor,
              currentRun: snapshot.latestRun
                ? {
                    id: snapshot.latestRun.id,
                    status: snapshot.latestRun.status,
                    errorCode: snapshot.latestRun.errorCode,
                    cancelRequested: snapshot.latestRun.cancelRequested,
                  }
                : null,
              pendingToolApprovals: snapshot.pendingToolApprovals.map(
                (approval) => ({ ...approval, status: "pending" as const }),
              ),
            } satisfies Omit<
              BackgroundExecutionView,
              "attachment" | "cancelStatus" | "liveMessageRevision"
            >;
          },
          cancelRun: (runId) =>
            cancelRunMutation.mutateAsync({
              projectId,
              conversationId,
              runId,
            }),
          decideApproval: (input) =>
            decideToolApprovalMutation.mutateAsync({
              projectId,
              conversationId,
              runId: input.runId,
              toolCallId: input.toolCallId,
              approved: input.approved,
            }),
          onHydratedSnapshot: ({ messages }) => {
            performToolSideEffectsForCompletedToolCalls({
              toolCalls: getCompletedToolCalls(messages),
              handledToolCallIds: handledToolCallIdsRef.current,
              utils,
            }).catch((error: unknown) => {
              console.error(
                "Failed to replay tRPC invalidations after hydrated in-app agent tool calls",
                error,
              );
            });
          },
          onSettled: () => {
            clearLoadingEvents();
            utils.inAppAgent.listConversations.invalidate({ projectId });
            utils.inAppAgent.getConversation.invalidate({
              projectId,
              conversationId,
            });
            releaseSubmitLock();
            activeRunIdRef.current = null;
            intentionalAbortRef.current = false;
          },
        });
        backgroundSessionRef.current = nextBackgroundSession;
        setBackgroundSession(nextBackgroundSession);
      }

      return agent;
    },
    [
      backgroundExecutionEnabled,
      cancelRunMutation,
      clearLoadingEvents,
      conversationQuery.data,
      createSharedAgentSubscriber,
      decideToolApprovalMutation,
      projectId,
      releaseSubmitLock,
      resetAgent,
      startRunMutation,
      utils,
    ],
  );

  const createRunInput = useCallback(
    (
      runParameters?: AgentInput,
      quickActionAttribution?: InAppAgentQuickActionAttribution,
      messageEntryPoint?: InAppAgentMessageEntryPoint,
    ): AgentInput => ({
      ...runParameters,
      context: createInAppAgentScreenContext({
        currentUrl: window.location.href,
      }).concat(
        createInAppAgentUserContext({
          userName: session.data?.user?.name,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          languages:
            navigator.languages.length > 0
              ? Array.from(navigator.languages)
              : [navigator.language],
        }),
        quickActionAttribution
          ? createInAppAgentQuickActionAttributionContext(
              quickActionAttribution,
            )
          : [],
        messageEntryPoint
          ? createInAppAgentMessageEntryPointContext(messageEntryPoint)
          : [],
      ),
    }),
    [session.data?.user?.name],
  );

  const runAgent = useCallback(
    (
      agent: AbstractAgent,
      conversationId: string,
      runParameters?: Parameters<AbstractAgent["runAgent"]>[0],
      quickActionAttribution?: InAppAgentQuickActionAttribution,
      messageEntryPoint?: InAppAgentMessageEntryPoint,
    ) => {
      if (runInFlightRef.current) {
        return Promise.resolve(false);
      }

      runInFlightRef.current = true;
      clearLoadingEvents();
      setIsForegroundRunning(true);
      return (async () => {
        try {
          await agent.runAgent(
            createRunInput(
              runParameters,
              quickActionAttribution,
              messageEntryPoint,
            ),
          );
          return true;
        } catch (error) {
          if (intentionalAbortRef.current) {
            return false;
          }

          if (runParameters?.forwardedProps?.command?.resume) {
            throw error;
          }

          setError(getInAppAgentError(error));
          console.error("In-app agent drawer error", error);
          return false;
        } finally {
          const runId = activeRunIdRef.current;
          clearLoadingEvents();
          setIsForegroundRunning(false);
          publishLiveMessages(
            attachActiveRunIdToAssistantMessages(
              agent.messages.filter(isAgentConversationMessage),
              runId,
            ),
          );
          utils.inAppAgent.listConversations.invalidate({ projectId });
          utils.inAppAgent.getConversation.invalidate({
            projectId,
            conversationId,
          });
          releaseSubmitLock();
          activeRunIdRef.current = null;
          intentionalAbortRef.current = false;
          runInFlightRef.current = false;
        }
      })();
    },
    [
      projectId,
      clearLoadingEvents,
      createRunInput,
      publishLiveMessages,
      releaseSubmitLock,
      utils.inAppAgent.getConversation,
      utils.inAppAgent.listConversations,
    ],
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      if (isRunning || conversationId === _selectedConversationId) {
        return;
      }

      setError((currentError) =>
        isInAppAgentRateLimited(currentError) ? currentError : null,
      );
      resetAgent();
      setForegroundMessages([]);
      setSelectedConversationId(conversationId);
    },
    [_selectedConversationId, isRunning, resetAgent, setSelectedConversationId],
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (isRunning) {
        return;
      }

      try {
        await deleteConversationMutation.mutateAsync({
          projectId,
          conversationId,
        });

        if (conversationId === selectedConversationId) {
          resetAgent();
          setForegroundMessages([]);
          setSelectedConversationId(null);
        }

        setFeedbackByConversationId((currentFeedback) => {
          if (!currentFeedback[conversationId]) {
            return currentFeedback;
          }

          const nextFeedback = { ...currentFeedback };
          delete nextFeedback[conversationId];
          return nextFeedback;
        });

        await Promise.all([
          utils.inAppAgent.listConversations.invalidate({ projectId }),
          utils.inAppAgent.getConversation.invalidate({
            projectId,
            conversationId,
          }),
        ]);
      } catch (error) {
        const errorMessage = getAgentErrorMessage(error);
        showErrorToast("Failed to delete conversation", errorMessage);
        console.error("Failed to delete in-app agent conversation", error);
        throw error;
      }
    },
    [
      deleteConversationMutation,
      isRunning,
      projectId,
      resetAgent,
      selectedConversationId,
      setFeedbackByConversationId,
      setSelectedConversationId,
      utils.inAppAgent.getConversation,
      utils.inAppAgent.listConversations,
    ],
  );

  const submit = useCallback(
    async (content: string, options?: InAppAgentSubmitOptions) => {
      if (
        !content ||
        isRunning ||
        isInAppAgentRateLimited(error) ||
        (options?.newConversation !== true &&
          isSelectedConversationHydrating) ||
        submitInFlightRef.current ||
        runInFlightRef.current
      ) {
        return false;
      }

      submitInFlightRef.current = true;
      setIsSubmitting(true);
      setError(null);

      let startedRun = false;
      try {
        const isNewConversation =
          options?.newConversation === true || !selectedConversationId;

        if (!isNewConversation && selectedConversationIsWriteLocked) {
          setError({
            type: "generic",
            message: SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
          });
          return false;
        }

        const conversationId = isNewConversation
          ? createInAppAgentConversationId()
          : selectedConversationId;

        if (!conversationId) {
          return false;
        }

        if (isNewConversation) {
          setSelectedConversationId(conversationId);
        }

        const storedMessages =
          conversationQuery.data?.conversation.id === conversationId
            ? conversationQuery.data.messages
            : undefined;
        const initialMessages = isNewConversation
          ? []
          : backgroundExecutionEnabled
            ? // Persisted state is the render source on the background path, so
              // prefer it over the in-memory transcript.
              (storedMessages?.filter(isAgentConversationMessage) ??
              getHydratedMessages(foregroundMessages, storedMessages))
            : getHydratedMessages(foregroundMessages, storedMessages);
        // TODO: Avoid hydrating the full history once the agent client can send
        // only the latest user turn; the server rebuilds history from persistence.
        const agent = getOrCreateAgent(
          conversationId,
          initialMessages,
          isNewConversation,
        );

        if (agent.isRunning) {
          return false;
        }

        // Start background turns from the persisted transcript and cursor.
        if (agent instanceof InAppAgentBackgroundClient && !isNewConversation) {
          agent.setMessages(initialMessages);
        }

        ensureSubscription(agent);

        const userMessage = {
          id: createInAppAgentMessageId(),
          role: "user",
          content,
        } satisfies AgUiMessage;

        agent.addMessage(userMessage);
        if (!backgroundExecutionEnabled) {
          setForegroundMessages(
            agent.messages.filter(isAgentConversationMessage),
          );
        }
        const entryPoint = options?.entryPoint ?? "chat";
        if (isNewConversation) {
          capture("in_app_agent:new_chat_started", { entryPoint });
        }
        capture("in_app_agent:new_chat_turn", { entryPoint });
        startedRun = true;
        if (backgroundExecutionEnabled) {
          const backgroundSession = backgroundSessionRef.current;

          if (!backgroundSession) {
            throw new Error("Background execution session is unavailable");
          }

          clearLoadingEvents();
          backgroundSession
            .run(createRunInput(undefined, options?.quickAction, entryPoint))
            .catch((error: unknown) => {
              if (
                backgroundSession.getSnapshot().attachment.status !== "error"
              ) {
                setError(getInAppAgentError(error));
              }
            });
        } else {
          runAgent(
            agent,
            conversationId,
            undefined,
            options?.quickAction,
            entryPoint,
          );
        }
        return true;
      } catch (error) {
        setError(getInAppAgentError(error));
        if (!backgroundExecutionEnabled) {
          console.error("Failed to start in-app agent conversation", error);
        }
        return false;
      } finally {
        if (!startedRun) {
          releaseSubmitLock();
        }
      }
    },
    [
      backgroundExecutionEnabled,
      conversationQuery.data,
      capture,
      clearLoadingEvents,
      ensureSubscription,
      error,
      createRunInput,
      getOrCreateAgent,
      isSelectedConversationHydrating,
      isRunning,
      foregroundMessages,
      releaseSubmitLock,
      runAgent,
      selectedConversationId,
      selectedConversationIsWriteLocked,
      setSelectedConversationId,
    ],
  );

  const submitFeedback = useCallback(
    async (params: {
      messageId: string;
      runId: string;
      value: InAppAgentMessageFeedbackValue | null;
      comment?: string | null;
    }) => {
      if (!selectedConversationId) {
        return;
      }

      try {
        const result = await feedbackMutation.mutateAsync({
          projectId,
          conversationId: selectedConversationId,
          messageId: params.messageId,
          runId: params.runId,
          value: params.value,
          comment: params.comment ?? null,
        });

        setFeedbackByConversationId((currentFeedback) => {
          const nextFeedback = { ...currentFeedback };
          const conversationFeedback = {
            ...(nextFeedback[selectedConversationId] ?? {}),
          };

          if (result.feedback) {
            conversationFeedback[params.messageId] = result.feedback;
          } else {
            delete conversationFeedback[params.messageId];
          }

          if (Object.keys(conversationFeedback).length > 0) {
            nextFeedback[selectedConversationId] = conversationFeedback;
          } else {
            delete nextFeedback[selectedConversationId];
          }

          return nextFeedback;
        });
      } catch (error) {
        const errorMessage = getAgentErrorMessage(error);
        showErrorToast("Failed to save feedback", errorMessage);
        console.error("Failed to save in-app agent feedback", error);
        throw error;
      }
    },
    [
      feedbackMutation,
      projectId,
      selectedConversationId,
      setFeedbackByConversationId,
    ],
  );

  // Hydrate transcript and cursor from one snapshot before observing its tail.
  const attachToConversation = useCallback(
    async (conversationId: string) => {
      if (!backgroundExecutionEnabled) {
        return;
      }

      const initialMessages =
        conversationQuery.data?.conversation.id === conversationId
          ? conversationQuery.data.messages.filter(isAgentConversationMessage)
          : [];
      const agent = getOrCreateAgent(conversationId, initialMessages, false);

      if (!(agent instanceof InAppAgentBackgroundClient)) {
        return;
      }

      ensureSubscription(agent);
      await backgroundSessionRef.current?.hydrateAndAttach();
    },
    [
      backgroundExecutionEnabled,
      conversationQuery.data,
      ensureSubscription,
      getOrCreateAgent,
    ],
  );
  const attachToConversationRef = useRef(attachToConversation);
  attachToConversationRef.current = attachToConversation;

  const hydratedActiveRunId =
    open &&
    backgroundExecutionEnabled &&
    conversationQuery.data?.conversation.id === selectedConversationId &&
    conversationQuery.data.latestRun &&
    isActiveInAppAgentRunStatus(conversationQuery.data.latestRun.status)
      ? conversationQuery.data.latestRun.id
      : null;

  // Reattach after refresh once the persisted active run is known.
  useEffect(() => {
    if (!hydratedActiveRunId || !selectedConversationId) {
      return;
    }

    attachToConversationRef
      .current(selectedConversationId)
      .catch(() => undefined);

    return () => {
      backgroundSessionRef.current?.detach();
    };
  }, [hydratedActiveRunId, selectedConversationId]);

  const setAgentOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (action) => {
      const nextOpen = evaluateSetStateAction(action, open);

      if (!nextOpen) {
        // Collapse the drawer when closing
        setIsExpanded(false);

        if (backgroundExecutionEnabled) {
          backgroundSessionRef.current?.detach();
          releaseSubmitLock();
        }
      }

      if (nextOpen && backgroundExecutionEnabled && selectedConversationId) {
        attachToConversation(selectedConversationId).catch(() => undefined);
      }

      setOpen(nextOpen);
    },
    [
      attachToConversation,
      backgroundExecutionEnabled,
      open,
      releaseSubmitLock,
      selectedConversationId,
      setOpen,
    ],
  );

  const openAssistant = useCallback(
    (source: InAppAgentEntryPoint) => {
      capture("in_app_agent:entry_point_click", { source });

      if (organization && !organization.aiFeaturesEnabled) {
        setEnableDialogOpen(true);
        return false;
      }

      setAgentOpen(true);
      return true;
    },
    [capture, organization, setAgentOpen],
  );

  const isCancellingRun = Boolean(
    backgroundExecutionView.cancelStatus === "submitting" ||
    (currentBackgroundRun &&
      isCancellableBackgroundRun(currentBackgroundRun.status) &&
      currentBackgroundRun.cancelRequested),
  );

  const cancelRun = useCallback(() => {
    const run = currentBackgroundRun;

    if (
      !selectedConversationId ||
      !run ||
      !isCancellableBackgroundRun(run.status) ||
      run.cancelRequested
    ) {
      return;
    }

    const initialMessages =
      conversationQuery.data?.conversation.id === selectedConversationId
        ? conversationQuery.data.messages.filter(isAgentConversationMessage)
        : [];
    const agent = getOrCreateAgent(
      selectedConversationId,
      initialMessages,
      false,
    );
    ensureSubscription(agent);
    const backgroundSession = backgroundSessionRef.current;

    if (!backgroundSession) {
      return;
    }

    backgroundSession.cancel().catch((error: unknown) => {
      showErrorToast("Failed to stop the run", getAgentErrorMessage(error));
    });
  }, [
    conversationQuery.data,
    currentBackgroundRun,
    ensureSubscription,
    getOrCreateAgent,
    selectedConversationId,
  ]);

  const decideBackgroundToolApproval = useCallback(
    async (params: {
      approval: InAppAgentPendingToolApproval;
      approved: boolean;
      conversationId: string;
    }) => {
      const runId =
        params.approval.runId ?? params.approval.approvalRequest.runId;

      setError(null);

      try {
        const initialMessages =
          conversationQuery.data?.conversation.id === params.conversationId
            ? conversationQuery.data.messages.filter(isAgentConversationMessage)
            : [];
        const agent = getOrCreateAgent(
          params.conversationId,
          initialMessages,
          false,
        );
        ensureSubscription(agent);
        const backgroundSession = backgroundSessionRef.current;

        if (!backgroundSession) {
          throw new Error("Background execution session is unavailable");
        }

        await backgroundSession.decide({
          runId,
          toolCallId: params.approval.approvalRequest.toolCallId,
          approved: params.approved,
        });
      } catch (error) {
        setError(getInAppAgentError(error));
      }
    },
    [conversationQuery.data, ensureSubscription, getOrCreateAgent],
  );

  const resumeToolApproval = useCallback(
    async (approvalId: string, approved: boolean) => {
      if (selectedConversationIsWriteLocked) {
        setError({
          type: "generic",
          message: SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
        });
        return;
      }

      const approval = effectivePendingToolApprovals.find(
        (approval) => approval.id === approvalId,
      );

      if (
        !approval ||
        !selectedConversationId ||
        isRunning ||
        runInFlightRef.current ||
        isInAppAgentRateLimited(error)
      ) {
        return;
      }

      if (backgroundExecutionEnabled) {
        await decideBackgroundToolApproval({
          approval,
          approved,
          conversationId: selectedConversationId,
        });
        return;
      }

      const agent = agentRef.current;
      if (!agent || agent.threadId !== selectedConversationId) {
        showErrorToast(
          "Failed to resume tool call",
          "The interrupted assistant run is no longer available.",
        );
        return;
      }

      updatePendingToolApprovals((currentApprovals) =>
        currentApprovals.map((currentApproval) =>
          currentApproval.id === approvalId
            ? { ...currentApproval, status: "submitting" }
            : currentApproval,
        ),
      );
      setError(null);

      try {
        ensureSubscription(agent);
        const completed = await runAgent(agent, selectedConversationId, {
          runId: createInAppAgentRunId(),
          forwardedProps: {
            command: {
              resume: {
                approved,
                approvalRequest: approval.approvalRequest,
              },
            },
          },
        });

        if (!completed) {
          updatePendingToolApprovals((currentApprovals) =>
            currentApprovals.map((currentApproval) =>
              currentApproval.id === approvalId
                ? { ...currentApproval, status: "pending" }
                : currentApproval,
            ),
          );
          return;
        }

        updatePendingToolApprovals((currentApprovals) =>
          currentApprovals.filter(
            (currentApproval) => currentApproval.id !== approvalId,
          ),
        );
      } catch (error) {
        const errorMessage = getAgentErrorMessage(error);
        if (errorMessage === "Invalid forwarded props") {
          updatePendingToolApprovals((currentApprovals) =>
            currentApprovals.filter(
              (currentApproval) => currentApproval.id !== approvalId,
            ),
          );
          setError({
            type: "generic",
            message: "This tool approval is no longer valid. Please try again.",
          });
          console.error("Failed to resume in-app agent tool call", error);
          return;
        }

        updatePendingToolApprovals((currentApprovals) =>
          currentApprovals.map((currentApproval) =>
            currentApproval.id === approvalId
              ? { ...currentApproval, status: "pending" }
              : currentApproval,
          ),
        );
        setError(getInAppAgentError(error));
        console.error("Failed to resume in-app agent tool call", error);
      }
    },
    [
      backgroundExecutionEnabled,
      decideBackgroundToolApproval,
      effectivePendingToolApprovals,
      ensureSubscription,
      error,
      isRunning,
      runAgent,
      selectedConversationId,
      selectedConversationIsWriteLocked,
      updatePendingToolApprovals,
    ],
  );

  const execution = useMemo<InAppAiAgentExecution>(() => {
    if (!backgroundExecutionEnabled) {
      return { type: "foreground" };
    }

    return {
      type: "background",
      run: currentBackgroundRun,
      isCancelling: isCancellingRun,
      cancel: cancelRun,
    };
  }, [
    backgroundExecutionEnabled,
    cancelRun,
    currentBackgroundRun,
    isCancellingRun,
  ]);

  const approveToolCall = useCallback(
    (approvalId: string) => resumeToolApproval(approvalId, true),
    [resumeToolApproval],
  );

  const rejectToolCall = useCallback(
    (approvalId: string) => resumeToolApproval(approvalId, false),
    [resumeToolApproval],
  );

  const value = useMemo<InAppAiAgentContextType>(
    () => ({
      isAvailable: true,
      open,
      setOpen: setAgentOpen,
      openAssistant,
      isExpanded,
      setIsExpanded,
      isRunning,
      isSubmitting,
      pendingToolApprovals: isSelectedConversationNotFound
        ? []
        : effectivePendingToolApprovals,
      isSelectedConversationHydrating,
      execution,
      error: effectiveError,
      messages: messagesWithUiState,
      liveMessageVersion,
      conversations,
      hasMoreConversations,
      isLoadingMoreConversations,
      selectedConversationId: selectedConversationId ?? undefined,
      selectedConversationIsWriteLocked,
      loadMoreConversations,
      invalidateConversations,
      selectConversation,
      deleteConversation,
      submit,
      approveToolCall,
      rejectToolCall,
      submitFeedback,
    }),
    [
      approveToolCall,
      isExpanded,
      conversations,
      effectiveError,
      hasMoreConversations,
      isLoadingMoreConversations,
      isRunning,
      isSelectedConversationHydrating,
      selectedConversationIsWriteLocked,
      isSubmitting,
      isSelectedConversationNotFound,
      deleteConversation,
      loadMoreConversations,
      liveMessageVersion,
      messagesWithUiState,
      open,
      openAssistant,
      execution,
      effectivePendingToolApprovals,
      rejectToolCall,
      setAgentOpen,
      invalidateConversations,
      selectConversation,
      selectedConversationId,
      submit,
      submitFeedback,
    ],
  );

  return (
    <InAppAiAgentContext.Provider value={value}>
      {children}
      <InAppAgentDisabledDialog
        open={enableDialogOpen}
        onOpenChange={setEnableDialogOpen}
        organizationId={organization?.id}
      />
    </InAppAiAgentContext.Provider>
  );
}

function isAgentConversationMessage(message: unknown): message is AgUiMessage {
  const result = AgUiMessageSchema.safeParse(message);

  return result.success;
}

function getHydratedMessages(
  localMessages: AgUiMessage[],
  storedMessages: readonly unknown[] | undefined,
): AgUiMessage[] {
  if (localMessages.length > 0) {
    return localMessages;
  }

  return storedMessages?.filter(isAgentConversationMessage) ?? [];
}

function mergeMessagesWithFeedback(
  messages: readonly AgUiMessage[],
  feedbackByMessageId: Record<string, InAppAgentMessageFeedback> | undefined,
): readonly AgUiMessage[] {
  if (!feedbackByMessageId || Object.keys(feedbackByMessageId).length === 0) {
    return messages;
  }

  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    const feedback = feedbackByMessageId[message.id];
    if (!feedback) {
      return message;
    }

    return { ...message, feedback };
  });
}

function attachActiveRunIdToAssistantMessages(
  messages: readonly AgUiMessage[],
  runId: string | null,
): readonly AgUiMessage[] {
  if (!runId) {
    return messages;
  }

  return messages.map((message) => {
    if (message.role !== "assistant" || message.runId) {
      return message;
    }

    return { ...message, runId };
  });
}

function getInAppAgentUrl() {
  return `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/in-app-agent`;
}

function getAgentErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const payload = "payload" in error ? error.payload : undefined;

    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      return payload.error;
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return "Assistant request failed. Please try again.";
}

export function useInAppAiAgent() {
  const ctx = useContext(InAppAiAgentContext);
  if (!ctx) {
    return NOOP_CONTEXT;
  }
  return ctx;
}

/** Whether the current user/context may use the in-app assistant at all.
 * Shared gate for the launcher button and the window host. */
export function useCanUseInAppAgent() {
  const { isAvailable } = useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useQueryProjectOrOrganization();

  return (
    isAvailable &&
    hasInAppAgentEntitlement &&
    isLangfuseCloud &&
    Boolean(organization)
  );
}
