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
import { EventType, HttpAgent } from "@ag-ui/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { z } from "zod";

import useSessionStorage from "@/src/components/useSessionStorage";
import { env } from "@/src/env.mjs";
import {
  createInAppAgentConversationId,
  createInAppAgentMessageId,
  createInAppAgentRunId,
} from "@/src/ee/features/in-app-agent/ids";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "@/src/ee/features/in-app-agent/constants";
import {
  AgUiMessageSchema,
  type AgUiMessage,
  type InAppAgentMessageFeedback,
  type InAppAgentMessageFeedbackValue,
  type InAppAgentRuntimeState,
  type InAppAgentToolApprovalRequest,
} from "@/src/ee/features/in-app-agent/schema";
import type { InAppAgentError } from "@/src/ee/features/in-app-agent/components/utils/utils";
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
} from "@/src/ee/features/in-app-agent/context";
import type {
  InAppAgentQuickActionAttribution,
  InAppAgentSubmitOptions,
} from "@/src/ee/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  getInAppAgentError,
  isInAppAgentRateLimited,
  type InAppAiAgentMessage,
} from "@/src/ee/features/in-app-agent/components/utils/utils";
import { evaluateSetStateAction } from "@/src/utils/evaluate-set-state-action";
import { InAppAgentDisabledDialog } from "@/src/ee/features/in-app-agent/components/InAppAgentDisabledDialog";

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
  error: null,
  messages: [],
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
  error: InAppAgentError | null;
  messages: InAppAiAgentMessage[];
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
  const agentRef = useRef<HttpAgent | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const intentionalAbortRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const subscriptionRef = useRef<ReturnType<HttpAgent["subscribe"]> | null>(
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

    return messagesWithFeedback.map((message) => {
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

  const resetAgent = useCallback(() => {
    if (agentRef.current?.isRunning) {
      intentionalAbortRef.current = true;
    }

    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
    agentRef.current?.abortRun();
    agentRef.current = null;
    activeRunIdRef.current = null;
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
    (agent: HttpAgent) => {
      if (subscriptionRef.current) {
        return;
      }

      subscriptionRef.current = agent.subscribe({
        onRunStartedEvent: (payload: { event: unknown }) => {
          if (
            typeof payload.event === "object" &&
            payload.event !== null &&
            "runId" in payload.event &&
            typeof payload.event.runId === "string"
          ) {
            activeRunIdRef.current = payload.event.runId;
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
          setMessages(
            attachActiveRunIdToAssistantMessages(
              messages.filter(isAgentConversationMessage),
              activeRunIdRef.current,
            ),
          );
        },
        onStateChanged: ({ messages }) => {
          setMessages(
            attachActiveRunIdToAssistantMessages(
              messages.filter(isAgentConversationMessage),
              activeRunIdRef.current,
            ),
          );
        },
      });
    },
    [clearLoadingEvents, updateLoadingEvent, updatePendingToolApprovals],
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

      const agent = new HttpAgent({
        url: getInAppAgentUrl(),
        threadId: conversationId,
        initialMessages,
        initialState: getConversationAgentState(
          projectId,
          conversationId,
          isNewConversation,
        ),
      });

      agentRef.current = agent;

      return agent;
    },
    [projectId, resetAgent],
  );

  const releaseSubmitLock = useCallback(() => {
    submitInFlightRef.current = false;
    setIsSubmitting(false);
  }, []);

  const runAgent = useCallback(
    (
      agent: HttpAgent,
      conversationId: string,
      runParameters?: Parameters<HttpAgent["runAgent"]>[0],
      quickActionAttribution?: InAppAgentQuickActionAttribution,
      messageEntryPoint?: InAppAgentMessageEntryPoint,
    ) => {
      clearLoadingEvents();
      setIsRunning(true);
      return agent
        .runAgent({
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
        })
        .then(() => true)
        .catch((error) => {
          if (intentionalAbortRef.current) {
            return false;
          }

          if (runParameters?.forwardedProps?.command?.resume) {
            throw error;
          }

          setError(getInAppAgentError(error));
          console.error("In-app agent drawer error", error);
          return false;
        })
        .finally(() => {
          const runId = activeRunIdRef.current;
          clearLoadingEvents();
          setIsRunning(false);
          setMessages(
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
        });
    },
    [
      projectId,
      clearLoadingEvents,
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
        submitInFlightRef.current
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
        const initialMessages = !isNewConversation
          ? getHydratedMessages(messages, storedMessages)
          : [];
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

  const setAgentOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (action) => {
      const nextOpen = evaluateSetStateAction(action, open);

      if (!nextOpen) {
        // Collapse the drawer when closing
        setIsExpanded(false);
      }

      setOpen(nextOpen);
    },
    [open, setOpen],
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

  const resumeToolApproval = useCallback(
    async (approvalId: string, approved: boolean) => {
      if (selectedConversationIsWriteLocked) {
        setError({
          type: "generic",
          message: SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
        });
        return;
      }

      const approval = pendingToolApprovals.find(
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
      ensureSubscription,
      error,
      isRunning,
      pendingToolApprovals,
      runAgent,
      selectedConversationId,
      selectedConversationIsWriteLocked,
      updatePendingToolApprovals,
    ],
  );

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
        : pendingToolApprovals,
      isSelectedConversationHydrating,
      error,
      messages: messagesWithUiState,
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
      messagesWithUiState,
      open,
      openAssistant,
      pendingToolApprovals,
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
