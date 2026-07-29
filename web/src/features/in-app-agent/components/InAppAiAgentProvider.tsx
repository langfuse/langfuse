import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type Dispatch,
  type SetStateAction,
} from "react";
import { EventType, HttpAgent, type AbstractAgent } from "@ag-ui/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { z } from "zod";

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
  getInAppAgentRunFailureMessage,
  isActiveInAppAgentRunStatus,
  isCancellableInAppAgentRunStatus,
  type AgUiMessage,
  type InAppAgentMessageFeedback,
  type InAppAgentMessageFeedbackValue,
  type InAppAgentRuntimeState,
  type InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import { InAppAgentRunStatus } from "@langfuse/shared";
import {
  InAppAgentBackgroundClient,
  type InAppAgentRunStatusUpdate,
} from "@/src/features/in-app-agent/lib/backgroundAgentClient";
import { useInAppAgentBackgroundExecutionEnabled } from "@/src/features/in-app-agent/lib/backgroundExecutionFlag";
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
  type InAppAgentInterruptedRun,
  type InAppAiAgentMessage,
} from "@/src/features/in-app-agent/components/utils/utils";
import { evaluateSetStateAction } from "@/src/utils/evaluate-set-state-action";
import { InAppAgentDisabledDialog } from "@/src/features/in-app-agent/components/InAppAgentDisabledDialog";

const SELECTED_CONVERSATION_STORAGE_KEY_PREFIX =
  "langfuse:in-app-ai-agent-selected-conversation";
const OPEN_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-open";
const FEEDBACK_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-feedback";
const SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE =
  "Sandbox-enabled conversations become read-only after 8 hours. Start a new conversation to continue.";
const EMPTY_MESSAGES: AgUiMessage[] = [];

export type InAppAgentEntryPoint =
  | "top_nav"
  | "keyboard_shortcut"
  | "dashboard_widget";

const MastraSuspendEventSchema = z.object({
  type: z.literal("mastra_suspend"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown().optional(),
  runId: z.string().min(1),
});

const getConversationAgentState = (
  projectId: string,
  conversationId: string,
  isNewConversation: boolean,
): InAppAgentRuntimeState =>
  isNewConversation
    ? { type: "newConversation", projectId }
    : { type: "existingConversation", projectId, conversationId };

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
  backgroundExecutionEnabled: false,
  backgroundRunNotice: null,
  isCancellingRun: false,
  interruptedRuns: [],
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

type InAppAgentDisplayPlacement = {
  anchorMessageId: string;
  order: number;
};

type InAppAgentDisplayState = {
  latestPlacement: InAppAgentDisplayPlacement | null;
  nativeToolCallParentMessageId: string | null;
  latestNewMessageId: string | null;
  nextOrder: number;
  seenMessageIds: ReadonlySet<string>;
  textByMessageId: Record<
    string,
    {
      nativeContent: string;
      publishedContent: string;
      segments: Array<
        InAppAgentDisplayPlacement & {
          id: string;
          content: string;
        }
      >;
    }
  >;
  toolCallPlacements: Record<string, InAppAgentDisplayPlacement | null>;
};

export type InAppAgentPendingToolApproval = {
  id: string;
  approvalRequest: InAppAgentToolApprovalRequest;
  status: "pending" | "submitting";
  /**
   * The parked run this approval belongs to, as recorded on the persisted
   * interrupt event. Present for approvals hydrated from history (background
   * execution); the live stream carries it inside `approvalRequest` instead.
   */
  runId?: string;
};

export type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
  isWriteLocked: boolean;
};

type InAppAiAgentContextType = {
  isAvailable: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** Open the assistant from an entrypoint. Owns the AI-features gate: shows
   * the disabled dialog and returns false when the organization has AI
   * features turned off. */
  openAssistant: (source: InAppAgentEntryPoint) => boolean;
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  isRunning: boolean;
  isSubmitting: boolean;
  pendingToolApprovals: InAppAgentPendingToolApproval[];
  isSelectedConversationHydrating: boolean;
  /** True when this browser is opted into worker-executed runs. */
  backgroundExecutionEnabled: boolean;
  /**
   * Copy about the current background run's lifecycle: that the user may
   * close the drawer while it works, or why the last one ended badly.
   */
  backgroundRunNotice: string | null;
  /** A stop has been requested and the run has not wound down yet. */
  isCancellingRun: boolean;
  /**
   * Turns that ended without finishing, so the transcript can mark the
   * boundary. Their partial events are kept, not hidden: the tool calls really
   * ran, and the event stream is the only record of them.
   */
  interruptedRuns: InAppAgentInterruptedRun[];
  /** Present only on the background path, where a run outlives the browser. */
  cancelRun?: () => void;
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
  const [messages, setMessages] = useState<AgUiMessage[]>([]);
  // Only live AG-UI publications increment this version. The display smoother
  // uses it to distinguish stream updates from history hydration, including
  // updates where the agent mutates message objects in place.
  const [liveMessageVersion, setLiveMessageVersion] = useState(0);
  const [displayState, setDisplayState] = useState(
    createInAppAgentDisplayState,
  );
  const [pendingToolApprovals, setPendingToolApprovals] = useState<
    InAppAgentPendingToolApproval[]
  >([]);
  const pendingToolApprovalsRef = useRef<InAppAgentPendingToolApproval[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingEventIds, setLoadingEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<InAppAgentError | null>(null);
  const agentRef = useRef<AbstractAgent | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const backgroundExecutionEnabled = useInAppAgentBackgroundExecutionEnabled();
  const [backgroundRunStatus, setBackgroundRunStatus] =
    useState<InAppAgentRunStatusUpdate | null>(null);
  // Read once, when a background transport is constructed; never rendered, so
  // mirroring it into state would re-render the drawer for nothing.
  const conversationCursorRef = useRef(-1);
  // Attaching is async (it fetches the persisted snapshot first), so the guard
  // has to be set synchronously or a re-render can start a second attach.
  const attachInFlightRef = useRef(false);
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

  // Written during render on purpose: neither value is rendered, both are read
  // when a background transport is constructed. Mirroring them into state
  // would re-render the drawer on every hydration for no visible reason.
  if (conversationQuery.data?.conversation.id === selectedConversationId) {
    conversationCursorRef.current = conversationQuery.data.eventCursor;
  }

  const persistedToolApprovals = useMemo(
    () =>
      conversationQuery.data?.conversation.id === selectedConversationId
        ? conversationQuery.data.pendingToolApprovals
        : [],
    [
      conversationQuery.data?.conversation.id,
      conversationQuery.data?.pendingToolApprovals,
      selectedConversationId,
    ],
  );

  /**
   * Approval cards visible to the drawer.
   *
   * The foreground path only ever learns about an approval from the live
   * stream, so a refresh loses the card. Background execution persists the
   * interrupt event, so history is the source of truth — but a card that has
   * just arrived over the tail is not in the last hydration yet, and one the
   * user is currently deciding carries local "submitting" state. Union both,
   * letting local status win.
   */
  const effectivePendingToolApprovals = useMemo(() => {
    if (!backgroundExecutionEnabled) {
      return pendingToolApprovals;
    }

    const localById = new Map(
      pendingToolApprovals.map((approval) => [approval.id, approval]),
    );

    const hydrated = persistedToolApprovals.map(
      ({ runId, approvalRequest }): InAppAgentPendingToolApproval => ({
        id: approvalRequest.toolCallId,
        approvalRequest,
        status: localById.get(approvalRequest.toolCallId)?.status ?? "pending",
        runId,
      }),
    );

    const hydratedIds = new Set(hydrated.map((approval) => approval.id));

    return [
      ...hydrated,
      ...pendingToolApprovals.filter(
        (approval) => !hydratedIds.has(approval.id),
      ),
    ];
  }, [
    backgroundExecutionEnabled,
    pendingToolApprovals,
    persistedToolApprovals,
  ]);
  const currentMessages = useMemo(() => {
    if (isSelectedConversationNotFound) {
      return EMPTY_MESSAGES;
    }

    const storedMessages =
      conversationQuery.data?.conversation.id === selectedConversationId
        ? conversationQuery.data.messages.filter(isAgentConversationMessage)
        : undefined;

    if (
      !isRunning &&
      storedMessages &&
      messages.length <= storedMessages.length
    ) {
      return storedMessages;
    }

    return messages;
  }, [
    conversationQuery.data,
    isRunning,
    isSelectedConversationNotFound,
    messages,
    selectedConversationId,
  ]);
  const messagesWithUiState = useMemo(() => {
    const messagesWithFeedback = mergeMessagesWithFeedback(
      currentMessages,
      selectedConversationId
        ? feedbackByConversationId[selectedConversationId]
        : undefined,
    );
    const displayMessages = projectInAppAgentMessagesForDisplay(
      messagesWithFeedback,
      displayState,
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
              loadingEventIds.has(toolCall.id),
          ) ??
            false),
      };
    });
  }, [
    feedbackByConversationId,
    currentMessages,
    loadingEventIds,
    selectedConversationId,
    displayState,
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
      const nextApprovals = updater(pendingToolApprovalsRef.current);
      pendingToolApprovalsRef.current = nextApprovals;
      setPendingToolApprovals(nextApprovals);
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
  const publishLiveMessages = useCallback((messages: AgUiMessage[]) => {
    setMessages(messages);
    setLiveMessageVersion((currentVersion) => currentVersion + 1);
  }, []);
  const publishAgentMessages = useCallback(
    (agentMessages: readonly unknown[]) => {
      const nextMessages = agentMessages.filter(isAgentConversationMessage);
      setDisplayState((currentState) =>
        recordInAppAgentMessagesForDisplay(currentState, nextMessages),
      );

      publishLiveMessages(
        attachActiveRunIdToAssistantMessages(
          nextMessages,
          activeRunIdRef.current,
        ),
      );
    },
    [publishLiveMessages],
  );

  const resetAgent = useCallback(() => {
    if (agentRef.current?.isRunning) {
      intentionalAbortRef.current = true;
    }

    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
    agentRef.current?.abortRun();
    agentRef.current = null;
    activeRunIdRef.current = null;
    setBackgroundRunStatus(null);
    setDisplayState(createInAppAgentDisplayState());
    pendingToolApprovalsRef.current = [];
    setPendingToolApprovals([]);
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

  const ensureSubscription = useCallback(
    (agent: AbstractAgent) => {
      if (subscriptionRef.current) {
        return;
      }

      subscriptionRef.current = agent.subscribe({
        onRunStartedEvent: ({
          event,
          messages: runMessages,
        }: {
          event: unknown;
          messages: readonly unknown[];
        }) => {
          setDisplayState((currentState) =>
            recordInAppAgentMessagesForDisplay(
              currentState,
              runMessages.filter(isAgentConversationMessage),
            ),
          );

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
            setDisplayState((currentState) =>
              recordInAppAgentToolCallForDisplay(
                currentState,
                event.toolCallId,
                event.parentMessageId,
              ),
            );

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
        onToolCallResultEvent: ({ event }) => {
          updatePendingToolApprovals((currentApprovals) =>
            currentApprovals.filter(
              (approval) =>
                approval.approvalRequest.toolCallId !== event.toolCallId,
            ),
          );
        },
        onRunErrorEvent: ({ event }) => {
          if (intentionalAbortRef.current) {
            return;
          }

          setError(getInAppAgentError(event));
          console.error("In-app agent drawer run error", event);
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
      clearLoadingEvents,
      publishAgentMessages,
      updateLoadingEvent,
      updatePendingToolApprovals,
    ],
  );

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

      const agent = backgroundExecutionEnabled
        ? new InAppAgentBackgroundClient({
            projectId,
            conversationId,
            threadId: conversationId,
            initialMessages,
            initialState,
            // The hydration snapshot's high-water mark. Attaching the tail
            // above it is gap-free and duplicate-free by construction.
            cursor: conversationCursorRef.current,
            startRun: (params) =>
              startRunMutation.mutateAsync({
                projectId,
                conversationId,
                message: params.message,
                context: [...params.context],
              }),
            onStatus: (status) => {
              activeRunIdRef.current = status.runId;
              setBackgroundRunStatus(status);
            },
          })
        : new HttpAgent({
            url: getInAppAgentUrl(),
            threadId: conversationId,
            initialMessages,
            initialState,
          });

      agentRef.current = agent;

      return agent;
    },
    [backgroundExecutionEnabled, projectId, resetAgent, startRunMutation],
  );

  const releaseSubmitLock = useCallback(() => {
    submitInFlightRef.current = false;
    setIsSubmitting(false);
  }, []);

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
      setIsRunning(true);
      return (async () => {
        try {
          await agent.runAgent({
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
          });
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
          setIsRunning(false);
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
      publishLiveMessages,
      releaseSubmitLock,
      session.data?.user?.name,
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
      setMessages([]);
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
          setMessages([]);
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
              getHydratedMessages(messages, storedMessages))
            : getHydratedMessages(messages, storedMessages);
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

        // Submitting is an attach boundary too: a reused transport still holds
        // AG-UI's in-memory transcript from the previous turn, while the
        // smoother's baseline came from the server's projection after that
        // turn's refetch. Re-seed both from persistence so the new turn is the
        // only thing that animates. Foreground keeps its existing behaviour,
        // where the transport is the sole source for a turn.
        if (agent instanceof InAppAgentBackgroundClient && !isNewConversation) {
          agent.setMessages(initialMessages);
          agent.setCursor(conversationCursorRef.current);
          setMessages(initialMessages);
        }

        ensureSubscription(agent);

        const userMessage = {
          id: createInAppAgentMessageId(),
          role: "user",
          content,
        } satisfies AgUiMessage;

        agent.addMessage(userMessage);
        setMessages(agent.messages.filter(isAgentConversationMessage));
        const entryPoint = options?.entryPoint ?? "chat";
        if (isNewConversation) {
          capture("in_app_agent:new_chat_started", { entryPoint });
        }
        capture("in_app_agent:new_chat_turn", { entryPoint });
        startedRun = true;
        runAgent(
          agent,
          conversationId,
          undefined,
          options?.quickAction,
          entryPoint,
        );
        return true;
      } catch (error) {
        setError(getInAppAgentError(error));
        console.error("Failed to start in-app agent conversation", error);
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
      ensureSubscription,
      error,
      getOrCreateAgent,
      isSelectedConversationHydrating,
      isRunning,
      messages,
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

  /**
   * Background path only. Re-seed the transport from persisted state, then tail
   * onward from that snapshot's cursor.
   *
   * The invariant this enforces: **the in-memory AG-UI transcript never crosses
   * an attach boundary.** Whenever the user (re)opens the drawer, reselects a
   * conversation, or decides an approval, what they see is what is in Postgres,
   * and the stream continues from exactly there.
   *
   * Why it has to be re-seeded rather than resumed: the smoother decides what
   * to animate by diffing the incoming message list against the one it last
   * held, per message id. After a turn ends, that held list came from the
   * server's display projection (the `getConversation` refetch), while a
   * carried-over agent's list is AG-UI's in-memory reduction. The two disagree,
   * so republishing the in-memory one reads as "the model just produced all of
   * this" and re-reveals the whole transcript from the first divergence. Seeding
   * both sides from the same persisted array makes that diff empty.
   */
  const attachToConversation = useCallback(
    async (conversationId: string) => {
      if (!backgroundExecutionEnabled || attachInFlightRef.current) {
        return;
      }

      attachInFlightRef.current = true;

      try {
        // Authoritative read rather than whatever the query cache holds: the
        // cursor and the transcript must come from one snapshot, or the tail
        // can replay events the transcript already contains.
        const snapshot = await utils.inAppAgent.getConversation.fetch({
          projectId,
          conversationId,
        });

        if (
          !snapshot.latestRun ||
          !isActiveInAppAgentRunStatus(snapshot.latestRun.status) ||
          runInFlightRef.current
        ) {
          return;
        }

        const persistedMessages = snapshot.messages.filter(
          isAgentConversationMessage,
        );
        const agent = getOrCreateAgent(
          conversationId,
          persistedMessages,
          false,
        );

        if (!(agent instanceof InAppAgentBackgroundClient)) {
          return;
        }

        agent.setMessages(persistedMessages);
        agent.setCursor(snapshot.eventCursor);
        // Deliberately not publishLiveMessages: hydration must not bump
        // liveMessageVersion, or the smoother animates history.
        setMessages(persistedMessages);

        ensureSubscription(agent);
        runInFlightRef.current = true;
        setIsRunning(true);

        agent
          .connectAgent()
          .finally(() => {
            clearLoadingEvents();
            setIsRunning(false);
            runInFlightRef.current = false;
            utils.inAppAgent.getConversation.invalidate({
              projectId,
              conversationId,
            });
            utils.inAppAgent.listConversations.invalidate({ projectId });
          })
          .catch((error: unknown) => {
            setError(getInAppAgentError(error));
            console.error(
              "Failed to attach to background assistant run",
              error,
            );
          });
      } finally {
        attachInFlightRef.current = false;
      }
    },
    [
      backgroundExecutionEnabled,
      clearLoadingEvents,
      ensureSubscription,
      getOrCreateAgent,
      projectId,
      utils.inAppAgent.getConversation,
      utils.inAppAgent.listConversations,
    ],
  );

  const hydratedActiveRunId =
    backgroundExecutionEnabled &&
    conversationQuery.data?.conversation.id === selectedConversationId &&
    conversationQuery.data.latestRun &&
    isActiveInAppAgentRunStatus(conversationQuery.data.latestRun.status)
      ? conversationQuery.data.latestRun.id
      : null;

  /**
   * External system: the watch SSE connection to a run executing on a worker.
   * Setup attaches the stream; the teardown effect below detaches it.
   *
   * An effect rather than an event handler because there is genuinely no
   * initiating gesture — after a refresh the drawer restores itself from
   * session storage and the conversation query resolves on its own, so "a run
   * is executing and nobody is watching it" is a state we discover.
   */
  useEffect(() => {
    if (!hydratedActiveRunId || !selectedConversationId) {
      return;
    }

    attachToConversation(selectedConversationId).catch((error: unknown) => {
      setError(getInAppAgentError(error));
      console.error("Failed to attach to background assistant run", error);
    });
  }, [attachToConversation, hydratedActiveRunId, selectedConversationId]);

  const setAgentOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (action) => {
      const nextOpen = evaluateSetStateAction(action, open);

      if (!nextOpen) {
        // Collapse the drawer when closing
        setIsExpanded(false);

        // A hidden drawer should not hold a watch connection open. Detaching is
        // not cancelling: the run keeps executing on the worker.
        if (backgroundExecutionEnabled) {
          agentRef.current?.abortRun();
        }
      }

      if (nextOpen && backgroundExecutionEnabled && selectedConversationId) {
        // Reopening is an attach boundary: show what is persisted now, then
        // stream onward from there.
        attachToConversation(selectedConversationId).catch((error: unknown) => {
          setError(getInAppAgentError(error));
          console.error("Failed to attach to background assistant run", error);
        });
      }

      setOpen(nextOpen);
    },
    [
      attachToConversation,
      backgroundExecutionEnabled,
      open,
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

  /**
   * Freshest view of the conversation's current run: the tail's status frame
   * while attached, the hydration snapshot otherwise. One source for the
   * notice, the stop control, and the cancel mutation, so they cannot disagree.
   */
  const currentBackgroundRun = useMemo(() => {
    if (!backgroundExecutionEnabled) {
      return null;
    }

    if (backgroundRunStatus) {
      return {
        id: backgroundRunStatus.runId,
        status: backgroundRunStatus.status,
        errorCode: backgroundRunStatus.errorCode ?? null,
        cancelRequested: backgroundRunStatus.cancelRequested === true,
      };
    }

    const hydrated = conversationQuery.data?.latestRun;

    return hydrated
      ? {
          id: hydrated.id,
          status: hydrated.status,
          errorCode: hydrated.errorCode,
          cancelRequested: hydrated.cancelRequested,
        }
      : null;
  }, [
    backgroundExecutionEnabled,
    backgroundRunStatus,
    conversationQuery.data?.latestRun,
  ]);

  const interruptedRuns = useMemo(
    () =>
      backgroundExecutionEnabled &&
      conversationQuery.data?.conversation.id === selectedConversationId
        ? conversationQuery.data.interruptedRuns
        : [],
    [
      backgroundExecutionEnabled,
      conversationQuery.data?.conversation.id,
      conversationQuery.data?.interruptedRuns,
      selectedConversationId,
    ],
  );

  const isCancellingRun = Boolean(
    currentBackgroundRun &&
    isActiveInAppAgentRunStatus(currentBackgroundRun.status) &&
    currentBackgroundRun.cancelRequested,
  );

  /**
   * Background runs outlive the browser, so the drawer has to say so — and has
   * to explain a failure the user did not witness.
   */

  /**
   * Cancel the run itself, server-side. Aborting the local stream would only
   * stop watching — the worker would keep going, which is the whole feature.
   */
  const cancelRun = useCallback(() => {
    const run = currentBackgroundRun;

    if (
      !selectedConversationId ||
      !run ||
      !isCancellableInAppAgentRunStatus(run.status) ||
      run.cancelRequested
    ) {
      return;
    }

    intentionalAbortRef.current = true;
    cancelRunMutation
      .mutateAsync({
        projectId,
        conversationId: selectedConversationId,
        runId: run.id,
      })
      .catch((error: unknown) => {
        intentionalAbortRef.current = false;
        showErrorToast("Failed to stop the run", getAgentErrorMessage(error));
      });
  }, [
    cancelRunMutation,
    currentBackgroundRun,
    projectId,
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

      updatePendingToolApprovals((currentApprovals) =>
        currentApprovals.map((currentApproval) =>
          currentApproval.id === params.approval.id
            ? { ...currentApproval, status: "submitting" }
            : currentApproval,
        ),
      );
      setError(null);

      try {
        await decideToolApprovalMutation.mutateAsync({
          projectId,
          conversationId: params.conversationId,
          runId,
          toolCallId: params.approval.approvalRequest.toolCallId,
          approved: params.approved,
        });

        updatePendingToolApprovals((currentApprovals) =>
          currentApprovals.filter(
            (currentApproval) => currentApproval.id !== params.approval.id,
          ),
        );

        // The decision queued a continuation run. Go through the same attach
        // path as reopening the drawer: re-seed from persisted state, then tail
        // onward. Resuming the in-memory transcript here is what made the whole
        // conversation appear to re-stream.
        await attachToConversation(params.conversationId);
      } catch (error) {
        updatePendingToolApprovals((currentApprovals) =>
          currentApprovals.map((currentApproval) =>
            currentApproval.id === params.approval.id
              ? { ...currentApproval, status: "pending" }
              : currentApproval,
          ),
        );
        setError(getInAppAgentError(error));
        console.error("Failed to decide in-app agent tool approval", error);
      }
    },
    [
      attachToConversation,
      decideToolApprovalMutation,
      projectId,
      updatePendingToolApprovals,
    ],
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

  const backgroundRunNotice = useMemo(() => {
    const run = currentBackgroundRun;

    if (!run) {
      return null;
    }

    if (isActiveInAppAgentRunStatus(run.status) && run.cancelRequested) {
      // Cancelling a RUNNING run is cooperative: the worker sees the flag on its
      // next heartbeat and stops at the following step boundary. Saying so is
      // what makes those seconds read as progress rather than a dead UI.
      return "Stopping the run…";
    }

    if (run.status === InAppAgentRunStatus.QUEUED) {
      return "Waiting for a worker to pick this up. You can close this; the run continues in the background.";
    }

    if (run.status === InAppAgentRunStatus.RUNNING) {
      return "You can close this; the run continues in the background.";
    }

    if (run.status === InAppAgentRunStatus.FAILED) {
      return getInAppAgentRunFailureMessage(run.errorCode ?? null);
    }

    return null;
  }, [currentBackgroundRun]);

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
      backgroundExecutionEnabled,
      backgroundRunNotice,
      isCancellingRun,
      interruptedRuns,
      cancelRun: backgroundExecutionEnabled ? cancelRun : undefined,
      error,
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
      error,
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
      backgroundExecutionEnabled,
      backgroundRunNotice,
      cancelRun,
      isCancellingRun,
      interruptedRuns,
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
  messages: AgUiMessage[],
  feedbackByMessageId: Record<string, InAppAgentMessageFeedback> | undefined,
): AgUiMessage[] {
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
  messages: AgUiMessage[],
  runId: string | null,
): AgUiMessage[] {
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

export function createInAppAgentDisplayState() {
  const state: InAppAgentDisplayState = {
    latestPlacement: null,
    nativeToolCallParentMessageId: null,
    latestNewMessageId: null,
    nextOrder: 0,
    seenMessageIds: new Set(),
    textByMessageId: {},
    toolCallPlacements: {},
  };

  return state;
}

export function recordInAppAgentMessagesForDisplay(
  state: InAppAgentDisplayState,
  messages: AgUiMessage[],
): InAppAgentDisplayState {
  const seenMessageIds = new Set(state.seenMessageIds);
  const textByMessageId = { ...state.textByMessageId };
  let latestNewMessageId = state.latestNewMessageId;
  let latestPlacement = state.latestPlacement;
  let nativeToolCallParentMessageId = state.nativeToolCallParentMessageId;
  let nextOrder = state.nextOrder;

  for (const message of messages) {
    if (seenMessageIds.has(message.id)) {
      continue;
    }

    seenMessageIds.add(message.id);
    latestNewMessageId = message.id;
    latestPlacement = null;
    nativeToolCallParentMessageId = null;

    if (message.role === "assistant" && typeof message.content === "string") {
      textByMessageId[message.id] = {
        nativeContent: message.content,
        publishedContent: message.content,
        segments: [],
      };
    }
  }

  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content !== "string") {
      continue;
    }

    const textState = textByMessageId[message.id];
    if (!textState || textState.publishedContent === message.content) {
      continue;
    }

    nativeToolCallParentMessageId = null;
    if (!message.content.startsWith(textState.publishedContent)) {
      textByMessageId[message.id] = {
        nativeContent: message.content,
        publishedContent: message.content,
        segments: [],
      };
      continue;
    }

    const appendedContent = message.content.slice(
      textState.publishedContent.length,
    );
    const latestSegment = textState.segments.at(-1);
    if (latestPlacement && latestSegment?.order === latestPlacement.order) {
      textByMessageId[message.id] = {
        ...textState,
        publishedContent: message.content,
        segments: textState.segments.slice(0, -1).concat({
          ...latestSegment,
          content: latestSegment.content + appendedContent,
        }),
      };
      continue;
    }

    if (latestNewMessageId === message.id && latestPlacement === null) {
      textByMessageId[message.id] = {
        ...textState,
        nativeContent: textState.nativeContent + appendedContent,
        publishedContent: message.content,
      };
      continue;
    }

    const anchorMessageId =
      latestPlacement?.anchorMessageId ?? latestNewMessageId;
    if (!anchorMessageId) {
      textByMessageId[message.id] = {
        ...textState,
        nativeContent: textState.nativeContent + appendedContent,
        publishedContent: message.content,
      };
      continue;
    }

    const placement = { anchorMessageId, order: nextOrder };
    const segment = {
      ...placement,
      id: `display-text-${message.id}-${textState.segments.length + 1}`,
      content: appendedContent,
    };
    nextOrder += 1;
    latestPlacement = placement;
    textByMessageId[message.id] = {
      ...textState,
      publishedContent: message.content,
      segments: textState.segments.concat(segment),
    };
  }

  return {
    ...state,
    latestPlacement,
    nativeToolCallParentMessageId,
    latestNewMessageId,
    nextOrder,
    seenMessageIds,
    textByMessageId,
  };
}

export function recordInAppAgentToolCallForDisplay(
  state: InAppAgentDisplayState,
  toolCallId: string,
  parentMessageId: string | undefined,
): InAppAgentDisplayState {
  if (toolCallId in state.toolCallPlacements) {
    return state;
  }

  const anchorMessageId =
    state.latestPlacement?.anchorMessageId ?? state.latestNewMessageId;
  const placement = anchorMessageId
    ? { anchorMessageId, order: state.nextOrder }
    : null;
  const isNativePlacement =
    (state.latestPlacement === null && anchorMessageId === parentMessageId) ||
    state.nativeToolCallParentMessageId === parentMessageId;

  return {
    ...state,
    latestPlacement: placement,
    nativeToolCallParentMessageId: isNativePlacement ? anchorMessageId : null,
    nextOrder: state.nextOrder + 1,
    toolCallPlacements: {
      ...state.toolCallPlacements,
      [toolCallId]: isNativePlacement ? null : placement,
    },
  };
}

export function projectInAppAgentMessagesForDisplay(
  messages: AgUiMessage[],
  state: InAppAgentDisplayState,
) {
  // Canonical messages stay untouched for persistence and subsequent runs.
  const messageIds = new Set(messages.map((message) => message.id));
  const placementsByAnchor = new Map<
    string,
    Array<{ order: number; message: AgUiMessage }>
  >();

  const addPlacement = (
    placement: InAppAgentDisplayPlacement,
    message: AgUiMessage,
  ) => {
    if (!messageIds.has(placement.anchorMessageId)) {
      return;
    }

    placementsByAnchor.set(
      placement.anchorMessageId,
      (placementsByAnchor.get(placement.anchorMessageId) ?? []).concat({
        order: placement.order,
        message,
      }),
    );
  };

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const toolCall of message.toolCalls ?? []) {
      const placement = state.toolCallPlacements[toolCall.id];
      if (
        !placement ||
        toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME
      ) {
        continue;
      }

      addPlacement(placement, {
        id: `display-tool-${toolCall.id}`,
        role: "assistant",
        content: "",
        toolCalls: [toolCall],
      });
    }
  }

  for (const [sourceMessageId, textState] of Object.entries(
    state.textByMessageId,
  )) {
    const sourceMessage = messages.find(
      (message) =>
        message.role === "assistant" && message.id === sourceMessageId,
    );

    for (const segment of textState.segments) {
      addPlacement(segment, {
        id: segment.id,
        role: "assistant",
        content: segment.content,
        ...(sourceMessage?.role === "assistant"
          ? {
              runId: sourceMessage.runId,
              feedback: sourceMessage.feedback,
              feedbackMessageId: sourceMessage.id,
            }
          : {}),
      });
    }
  }

  return messages.flatMap<InAppAiAgentMessage>((message) => {
    const projectedMessage =
      message.role === "assistant"
        ? {
            ...message,
            content:
              state.textByMessageId[message.id]?.nativeContent ??
              message.content,
            toolCalls: message.toolCalls?.filter((toolCall) => {
              const placement = state.toolCallPlacements[toolCall.id];
              return (
                toolCall.function.name === IN_APP_AGENT_REDIRECT_TOOL_NAME ||
                !placement ||
                !messageIds.has(placement.anchorMessageId)
              );
            }),
          }
        : message;
    const placements = placementsByAnchor.get(message.id);
    if (!placements) {
      return [projectedMessage];
    }

    return [
      projectedMessage,
      ...placements
        .sort((left, right) => left.order - right.order)
        .map(({ message: placedMessage }) => placedMessage),
    ];
  });
}

function parseInAppAgentInterruptEvent(event: unknown) {
  if (!event || typeof event !== "object") {
    return null;
  }

  if (!("name" in event) || event.name !== "on_interrupt") {
    return null;
  }

  const value = "value" in event ? event.value : undefined;
  const parsedValue = typeof value === "string" ? parseJson(value) : value;
  const interrupt = MastraSuspendEventSchema.safeParse(parsedValue);

  if (!interrupt.success) {
    return null;
  }

  return {
    type: "tool_approval_request" as const,
    toolCallId: interrupt.data.toolCallId,
    toolName: interrupt.data.toolName,
    args: interrupt.data.args,
    runId: interrupt.data.runId,
  } satisfies InAppAgentToolApprovalRequest;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
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
