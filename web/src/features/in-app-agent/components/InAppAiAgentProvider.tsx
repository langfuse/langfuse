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
import { EventType, type AgentSubscriber } from "@ag-ui/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import useSessionStorage from "@/src/components/useSessionStorage";
import { createInAppAgentConversationId } from "../ids";
import {
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  AgUiMessageSchema,
  dropEmptyAssistantMessages,
  dropUnpairedAssistantToolCalls,
  type AgUiMessage,
  type InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import { isActiveInAppAgentRunStatus } from "../watchFrames";
import type {
  InAppAgentMessageFeedback,
  InAppAgentMessageFeedbackValue,
  InAppAgentUiMessage,
} from "../schema";
import {
  createInAppAgentDisplayState,
  deserializeInAppAgentDisplayState,
  projectInAppAgentMessagesForDisplay,
  type InAppAgentDisplayState,
} from "@/src/features/in-app-agent/lib/display";
import { useInAppAgentActivity } from "@/src/features/in-app-agent/lib/useInAppAgentActivity";
import {
  getInAppAgentPendingNotificationCards,
  type InAppAgentActivityByConversationId,
} from "@/src/features/in-app-agent/lib/inAppAgentActivity";
import { InAppAgentActivityNotifications } from "@/src/features/in-app-agent/components/InAppAgentActivityNotifications";
import { InAppAgentBackgroundClient } from "@/src/features/in-app-agent/lib/backgroundAgentClient";
import {
  BackgroundExecutionSessionController,
  isCancellableBackgroundRun,
  type BackgroundExecutionRunView,
  type BackgroundExecutionSession,
  type BackgroundExecutionView,
} from "@/src/features/in-app-agent/lib/backgroundExecutionSession";
import {
  type InAppAgentError,
  getInAppAgentError,
  isInAppAgentRateLimited,
  type InAppAiAgentMessage,
} from "@/src/features/in-app-agent/components/utils/utils";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showErrorToast } from "@/src/features/notifications";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { api } from "@/src/utils/api";
import {
  createInAppAgentScreenContext,
  createInAppAgentUserContext,
} from "@/src/features/in-app-agent/context";
import type { InAppAgentSubmitOptions } from "@/src/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
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
  | "dashboard_widget"
  | "v4_migration"
  | "evaluators_empty_state";

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
  execution: { run: null, isCancelling: false, cancel: () => undefined },
  error: null,
  messages: [],
  liveMessageVersion: 0,
  conversations: [],
  hasMoreConversations: false,
  isLoadingMoreConversations: false,
  activityByConversationId: new Map(),
  attentionCount: 0,
  selectedConversationId: undefined,
  selectedConversationTitle: null,
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

type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
};

type InAppAiAgentExecution = {
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
  /** Conversations wanting attention, by id. */
  activityByConversationId: InAppAgentActivityByConversationId;
  /** Conversations the user still owes a look, for the launcher badge. */
  attentionCount: number;
  selectedConversationId: string | undefined;
  /** Server-given name of the selected conversation, null until it has one. */
  selectedConversationTitle: string | null;
  loadMoreConversations: () => void;
  invalidateConversations: () => void;
  selectConversation: (conversationId: string | null) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  submit: (
    content: string,
    options?: InAppAgentSubmitOptions,
  ) => Promise<boolean>;
  approveToolCall: (approvalId: string) => Promise<void>;
  alwaysAllowToolCall?: (approvalId: string) => Promise<void>;
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
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  const [open, setOpen] = useSessionStorage<boolean>(
    `${OPEN_STORAGE_KEY_PREFIX}:${projectId}`,
    defaultOpen ?? false,
  );

  // Remount when userId resolves so activity localStorage re-reads the
  // user-scoped ledger key (useLocalStorage only loads on mount).
  return (
    <InAppAiAgentProviderInner
      key={userId ?? "pending-session"}
      projectId={projectId}
      userId={userId}
      open={open}
      setOpen={setOpen}
    >
      {children}
    </InAppAiAgentProviderInner>
  );
}

type InAppAiAgentProviderInnerProps = PropsWithChildren<{
  projectId: string;
  userId: string | null;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}>;

function InAppAiAgentProviderInner({
  children,
  projectId,
  userId,
  open,
  setOpen,
}: InAppAiAgentProviderInnerProps) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const session = useSession();
  const canUseAssistant = useCanUseInAppAgent();
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
  const [isExpanded, setIsExpanded] = useState(false);
  // Key by conversation so another conversation cannot release its submit lock.
  const [submittingConversationId, setSubmittingConversationId] = useState<
    string | null
  >(null);
  const [unpersistedConversationIds, setUnpersistedConversationIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [loadingEventIds, setLoadingEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<InAppAgentError | null>(null);
  const backgroundSessionRef = useRef<BackgroundExecutionSession | null>(null);
  const [backgroundSession, setBackgroundSession] =
    useState<BackgroundExecutionSession | null>(null);
  const toolCallNamesRef = useRef(new Map<string, string>());
  const handledToolCallIdsRef = useRef(new Set<string>());
  const submitInFlightRef = useRef<string | null>(null);

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
      // Provisional ids become fetchable after `startRun` acknowledges persistence.
      enabled:
        open &&
        Boolean(_selectedConversationId) &&
        !unpersistedConversationIds.has(_selectedConversationId ?? ""),
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
  const isSubmitting =
    submittingConversationId !== null &&
    submittingConversationId === selectedConversationId;

  const conversations = useMemo(
    () =>
      conversationListQuery.data?.pages.flatMap((page) => page.conversations) ??
      [],
    [conversationListQuery.data?.pages],
  );
  const hasMoreConversations = conversationListQuery.hasNextPage === true;
  const isLoadingMoreConversations = conversationListQuery.isFetchingNextPage;

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
  const currentBackgroundRun = backgroundExecutionView.currentRun;
  const isBackgroundRunning =
    backgroundExecutionView.attachment.status === "attaching" ||
    backgroundExecutionView.attachment.status === "attached" ||
    Boolean(
      currentBackgroundRun &&
      isActiveInAppAgentRunStatus(currentBackgroundRun.status),
    );
  const isRunning = isBackgroundRunning;
  const effectiveError =
    backgroundExecutionView.attachment.status === "error"
      ? getInAppAgentError(backgroundExecutionView.attachment.error)
      : error;
  const liveMessageVersion = backgroundExecutionView.liveMessageRevision;

  const {
    activityByConversationId,
    attentionCount,
    delivered,
    refetchActivity,
    markConversationHandled,
    markDelivered,
  } = useInAppAgentActivity({
    projectId,
    userId,
    // Polling a project the server will reject turns every page load and
    // window focus into a Forbidden toast.
    enabled: canUseAssistant,
    // Only what the user can actually see counts as looked at; a selected
    // conversation behind a closed window has not been read.
    visibleConversationId: open ? selectedConversationId : null,
  });

  // What the window titles itself by. Three sources, because no single one
  // covers every way a conversation gets selected: the snapshot query is
  // authoritative and runs for the selected id whatever the list has loaded,
  // the recent list already holds the title when you pick one out of history,
  // and the activity poll is the only one warm when a background-run
  // notification opens a conversation the list has yet to fetch.
  const selectedConversationTitle =
    (conversationQuery.data?.conversation.id === selectedConversationId
      ? conversationQuery.data.conversation.title
      : null) ??
    conversations.find(
      (conversation) => conversation.id === selectedConversationId,
    )?.title ??
    (selectedConversationId
      ? activityByConversationId.get(selectedConversationId)?.title
      : null) ??
    null;

  const effectivePendingToolApprovals = useMemo(() => {
    return backgroundExecutionView.pendingToolApprovals.map(
      ({ runId, approvalRequest, status }): InAppAgentPendingToolApproval => ({
        id: approvalRequest.toolCallId,
        approvalRequest,
        status,
        runId,
      }),
    );
  }, [backgroundExecutionView.pendingToolApprovals]);
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

    return {
      messages: backgroundExecutionView.messages,
      displayState: backgroundExecutionView.displayState,
      isSettled: !isBackgroundRunning,
    };
  }, [
    backgroundExecutionView.displayState,
    backgroundExecutionView.messages,
    isBackgroundRunning,
    isSelectedConversationNotFound,
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
    const messagesWithRunId = attachActiveRunIdToAssistantMessages(
      prunedMessages,
      currentBackgroundRun?.id ?? null,
    );
    const messagesWithFeedback = mergeMessagesWithFeedback(
      messagesWithRunId,
      selectedConversationId
        ? feedbackByConversationId[selectedConversationId]
        : undefined,
    );
    const unresolvedActiveRunToolCallIds = new Set<string>();
    if (
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
          (message.feedbackMessageId
            ? loadingEventIds.has(message.feedbackMessageId)
            : false) ||
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
  const invalidateConversations = useCallback(() => {
    Promise.resolve(
      utils.inAppAgent.listConversations.invalidate({ projectId }),
    ).catch(() => undefined);
    Promise.resolve(refetchActivity()).catch(() => undefined);
  }, [projectId, refetchActivity, utils.inAppAgent.listConversations]);

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
  const resetAgent = useCallback(() => {
    backgroundSessionRef.current?.dispose();
    backgroundSessionRef.current = null;
    setBackgroundSession(null);
    toolCallNamesRef.current.clear();
    handledToolCallIdsRef.current.clear();
    clearLoadingEvents();
  }, [clearLoadingEvents]);

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

  const sharedAgentSubscriber = useMemo(
    () =>
      ({
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
          setError(getInAppAgentError(event));
        },
      }) satisfies AgentSubscriber,
    [clearLoadingEvents, updateLoadingEvent, utils],
  );

  // Release only the caller's lock; a newer conversation may own it.
  const releaseSubmitLock = useCallback((conversationId: string | null) => {
    if (
      conversationId !== null &&
      submitInFlightRef.current !== conversationId
    ) {
      return;
    }

    submitInFlightRef.current = null;
    setSubmittingConversationId(null);
  }, []);

  const getOrCreateBackgroundSession = useCallback(
    (conversationId: string, initialMessages: AgUiMessage[]) => {
      if (backgroundSessionRef.current?.conversationId === conversationId) {
        return backgroundSessionRef.current;
      }

      resetAgent();

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

      const agent = new InAppAgentBackgroundClient({
        projectId,
        conversationId,
        threadId: conversationId,
        initialMessages,
        cursor: initialCursor,
        startRun: async (params) => {
          const started = await startRunMutation.mutateAsync({
            projectId,
            conversationId,
            message: params.message,
            context: [...params.context],
          });
          setUnpersistedConversationIds((current) => {
            if (!current.has(started.conversationId)) {
              return current;
            }

            const next = new Set(current);
            next.delete(started.conversationId);
            return next;
          });
          Promise.resolve(refetchActivity()).catch(() => undefined);
          return started;
        },
      });

      const nextBackgroundSession = new BackgroundExecutionSessionController({
        agent,
        subscriber: sharedAgentSubscriber,
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
            approvalScope: input.approvalScope,
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
          Promise.resolve(
            utils.inAppAgent.listConversations.invalidate({ projectId }),
          ).catch(() => undefined);
          Promise.resolve(
            utils.inAppAgent.getConversation.invalidate({
              projectId,
              conversationId,
            }),
          ).catch(() => undefined);
          Promise.resolve(refetchActivity()).catch(() => undefined);
          releaseSubmitLock(conversationId);
        },
      });
      backgroundSessionRef.current = nextBackgroundSession;
      setBackgroundSession(nextBackgroundSession);

      return nextBackgroundSession;
    },
    [
      cancelRunMutation,
      clearLoadingEvents,
      conversationQuery.data,
      decideToolApprovalMutation,
      projectId,
      refetchActivity,
      releaseSubmitLock,
      resetAgent,
      sharedAgentSubscriber,
      startRunMutation,
      utils,
    ],
  );

  const createRunContext = useCallback(
    () =>
      createInAppAgentScreenContext({
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
      ),
    [session.data?.user?.name],
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      if (conversationId === _selectedConversationId) {
        return;
      }

      setError((currentError) =>
        isInAppAgentRateLimited(currentError) ? currentError : null,
      );
      releaseSubmitLock(_selectedConversationId);
      resetAgent();
      setSelectedConversationId(conversationId);

      if (conversationId && open) {
        const entry = activityByConversationId.get(conversationId);
        if (entry?.needsAttention) {
          markConversationHandled(conversationId, entry.activityKey);
        }
      }
    },
    [
      _selectedConversationId,
      activityByConversationId,
      markConversationHandled,
      open,
      releaseSubmitLock,
      resetAgent,
      setSelectedConversationId,
    ],
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversationMutation.mutateAsync({
          projectId,
          conversationId,
        });

        if (conversationId === selectedConversationId) {
          resetAgent();
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
      // A new conversation must not inherit the selected conversation's guards.
      const startsNewConversation =
        options?.newConversation === true || !selectedConversationId;
      const conversationId = startsNewConversation
        ? createInAppAgentConversationId()
        : selectedConversationId;
      const shouldRestorePersistedMessages =
        !startsNewConversation &&
        !unpersistedConversationIds.has(conversationId ?? "");

      if (
        !content ||
        !conversationId ||
        isInAppAgentRateLimited(error) ||
        submitInFlightRef.current === conversationId
      ) {
        return false;
      }

      if (
        !startsNewConversation &&
        (isRunning || isSelectedConversationHydrating)
      ) {
        return false;
      }

      submitInFlightRef.current = conversationId;
      setSubmittingConversationId(conversationId);
      setError(null);

      let startedRun = false;
      try {
        if (startsNewConversation) {
          setUnpersistedConversationIds((current) =>
            new Set(current).add(conversationId),
          );
          setSelectedConversationId(conversationId);
        }

        const storedMessages =
          conversationQuery.data?.conversation.id === conversationId
            ? conversationQuery.data.messages
            : undefined;
        const initialMessages = shouldRestorePersistedMessages
          ? (storedMessages?.filter(isAgentConversationMessage) ?? [])
          : [];
        // TODO: Avoid hydrating the full history once the agent client can send
        // only the latest user turn; the server rebuilds history from persistence.
        const backgroundSession = getOrCreateBackgroundSession(
          conversationId,
          initialMessages,
        );
        const execution = backgroundSession.run({
          message: content,
          context: createRunContext(),
        });
        if (!execution) {
          return false;
        }
        const entryPoint = options?.entryPoint ?? "chat";
        if (startsNewConversation) {
          capture("in_app_agent:new_chat_started", {
            entryPoint,
            // Whether starting here means running two conversations at once.
            hasOtherActiveRun: [...activityByConversationId.entries()].some(
              ([otherId, activity]) =>
                otherId !== conversationId &&
                (activity.state === "running" || activity.state === "approval"),
            ),
          });
        }
        capture("in_app_agent:new_chat_turn", { entryPoint });
        startedRun = true;
        clearLoadingEvents();
        execution.catch((error: unknown) => {
          if (backgroundSession.getSnapshot().attachment.status !== "error") {
            setError(getInAppAgentError(error));
          }
        });
        return true;
      } catch (error) {
        setError(getInAppAgentError(error));
        return false;
      } finally {
        if (!startedRun) {
          releaseSubmitLock(conversationId);
        }
      }
    },
    [
      activityByConversationId,
      conversationQuery.data,
      capture,
      clearLoadingEvents,
      error,
      createRunContext,
      getOrCreateBackgroundSession,
      isSelectedConversationHydrating,
      isRunning,
      releaseSubmitLock,
      selectedConversationId,
      setSelectedConversationId,
      unpersistedConversationIds,
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
      const initialMessages =
        conversationQuery.data?.conversation.id === conversationId
          ? conversationQuery.data.messages.filter(isAgentConversationMessage)
          : [];
      await getOrCreateBackgroundSession(
        conversationId,
        initialMessages,
      ).hydrateAndAttach();
    },
    [conversationQuery.data, getOrCreateBackgroundSession],
  );
  const attachToConversationRef = useRef(attachToConversation);
  attachToConversationRef.current = attachToConversation;

  const hydratedActiveRunId =
    open &&
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

        backgroundSessionRef.current?.detach();
        releaseSubmitLock(selectedConversationId);
      }

      if (nextOpen && selectedConversationId) {
        attachToConversation(selectedConversationId).catch(() => undefined);
      }

      setOpen(nextOpen);
    },
    [
      attachToConversation,
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
    const backgroundSession = getOrCreateBackgroundSession(
      selectedConversationId,
      initialMessages,
    );

    backgroundSession.cancel().catch((error: unknown) => {
      showErrorToast("Failed to stop the run", getAgentErrorMessage(error));
    });
  }, [
    conversationQuery.data,
    currentBackgroundRun,
    getOrCreateBackgroundSession,
    selectedConversationId,
  ]);

  const decideBackgroundToolApproval = useCallback(
    async (params: {
      approval: InAppAgentPendingToolApproval;
      approved: boolean;
      approvalScope: "once" | "conversation";
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
        const backgroundSession = getOrCreateBackgroundSession(
          params.conversationId,
          initialMessages,
        );

        await backgroundSession.decide({
          runId,
          toolCallId: params.approval.approvalRequest.toolCallId,
          approved: params.approved,
          approvalScope: params.approvalScope,
        });
        return true;
      } catch (error) {
        setError(getInAppAgentError(error));
        return false;
      }
    },
    [conversationQuery.data, getOrCreateBackgroundSession],
  );

  const resumeToolApproval = useCallback(
    async (
      approvalId: string,
      approved: boolean,
      approvalScope: "once" | "conversation" = "once",
    ) => {
      const approval = effectivePendingToolApprovals.find(
        (approval) => approval.id === approvalId,
      );

      if (
        !approval ||
        !selectedConversationId ||
        isRunning ||
        isInAppAgentRateLimited(error)
      ) {
        return;
      }

      const decisionAccepted = await decideBackgroundToolApproval({
        approval,
        approved,
        approvalScope,
        conversationId: selectedConversationId,
      });
      if (decisionAccepted) {
        capture("in_app_agent:tool_approval_decided", {
          isApproved: approved,
          toolName: approval.approvalRequest.toolName,
          approvalScope,
        });
      }
    },
    [
      capture,
      decideBackgroundToolApproval,
      effectivePendingToolApprovals,
      error,
      isRunning,
      selectedConversationId,
    ],
  );

  const execution = useMemo<InAppAiAgentExecution>(
    () => ({
      run: currentBackgroundRun,
      isCancelling: isCancellingRun,
      cancel: cancelRun,
    }),
    [cancelRun, currentBackgroundRun, isCancellingRun],
  );

  /** Only outcomes and questions surface as cards; a run in progress is not news. */
  const activityNotifications = useMemo(
    () =>
      getInAppAgentPendingNotificationCards({
        activityByConversationId,
        delivered,
      }),
    [activityByConversationId, delivered],
  );

  const openConversationFromActivity = useCallback(
    (conversationId: string) => {
      const state = activityByConversationId.get(conversationId)?.state;

      capture("in_app_agent:activity_opened", {
        source: "notification",
        activityType: state ?? "unknown",
      });
      setAgentOpen(true);
      selectConversation(conversationId);
    },
    [activityByConversationId, capture, selectConversation, setAgentOpen],
  );

  const approveToolCall = useCallback(
    (approvalId: string) => resumeToolApproval(approvalId, true),
    [resumeToolApproval],
  );

  const alwaysAllowToolCall = useCallback(
    (approvalId: string) =>
      resumeToolApproval(approvalId, true, "conversation"),
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
      activityByConversationId,
      attentionCount,
      selectedConversationId: selectedConversationId ?? undefined,
      selectedConversationTitle,
      loadMoreConversations,
      invalidateConversations,
      selectConversation,
      deleteConversation,
      submit,
      approveToolCall,
      alwaysAllowToolCall,
      rejectToolCall,
      submitFeedback,
    }),
    [
      activityByConversationId,
      approveToolCall,
      attentionCount,
      alwaysAllowToolCall,
      isExpanded,
      conversations,
      effectiveError,
      hasMoreConversations,
      isLoadingMoreConversations,
      isRunning,
      isSelectedConversationHydrating,
      selectedConversationTitle,
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
      {/* Rendered here, not from the window host, which unmounts when the
          assistant is closed — exactly when a notification matters most. */}
      <InAppAgentActivityNotifications
        notifications={activityNotifications}
        onDelivered={markDelivered}
        onOpenConversation={openConversationFromActivity}
      />
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

function mergeMessagesWithFeedback(
  messages: readonly AgUiMessage[],
  feedbackByMessageId: Record<string, InAppAgentMessageFeedback> | undefined,
): readonly InAppAgentUiMessage[] {
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

/** Whether a run would be admitted for this project. Client mirror of
 * assertInAppAgentAvailable: instance switch, entitlement, and org AI
 * Features. Use this for polling and other paths that must not hit the
 * server when org AI Features is off. More restrictive than
 * useIsInAppAgentLauncherVisible. */
function useCanUseInAppAgent() {
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const { organization } = useQueryProjectOrOrganization();
  const session = useSession();
  const instanceEnabled = session.data?.environment.inAppAgentEnabled ?? false;

  return (
    instanceEnabled &&
    hasInAppAgentEntitlement &&
    Boolean(organization?.aiFeaturesEnabled)
  );
}

/** Whether to show Assistant entry points (nav launcher, v4/eval CTAs).
 * Looser than useCanUseInAppAgent: with org AI Features off they still
 * show, and clicking opens the dialog that turns it on. Hidden entirely
 * when the instance-wide switch is off. */
export function useIsInAppAgentLauncherVisible() {
  const { isAvailable } = useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const { organization } = useQueryProjectOrOrganization();
  const session = useSession();
  const instanceEnabled = session.data?.environment.inAppAgentEnabled ?? false;

  return (
    instanceEnabled &&
    isAvailable &&
    hasInAppAgentEntitlement &&
    Boolean(organization)
  );
}
