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
import { useStore } from "zustand";

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
} from "@/src/ee/features/in-app-agent/context";
import type { InAppAgentSubmitOptions } from "@/src/ee/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  EMPTY_IN_APP_AGENT_CONVERSATION_STATE,
  NEW_CONVERSATION_DRAFT_KEY,
  createInAppAgentClientStore,
  type InAppAgentPendingToolApproval,
  type InAppAgentQueuedMessage,
} from "@/src/ee/features/in-app-agent/components/inAppAgentClientStore";
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

type InAppAiAgentFeedbackByConversationId = Record<
  string,
  Record<string, InAppAgentMessageFeedback>
>;

export type { InAppAgentPendingToolApproval, InAppAgentQueuedMessage };

export type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
  isWriteLocked: boolean;
  activity?: {
    isRunning: boolean;
    requiresApproval: boolean;
    queuedCount: number;
  };
};

type InAppAiAgentContextType = {
  isAvailable: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  openAssistant: (source: InAppAgentEntryPoint) => boolean;
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  isRunning: boolean;
  isSubmitting: boolean;
  pendingToolApprovals: InAppAgentPendingToolApproval[];
  queuedMessages: InAppAgentQueuedMessage[];
  draft: string;
  isSelectedConversationHydrating: boolean;
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
  setDraft: (draft: string) => void;
  editQueuedMessage: (messageId: string, content: string) => void;
  deleteQueuedMessage: (messageId: string) => void;
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
  queuedMessages: [],
  draft: "",
  isSelectedConversationHydrating: false,
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
  setDraft: () => undefined,
  editQueuedMessage: () => undefined,
  deleteQueuedMessage: () => undefined,
  submit: async () => false,
  approveToolCall: async () => undefined,
  rejectToolCall: async () => undefined,
  submitFeedback: async () => undefined,
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
}: InAppAiAgentProviderProps & { projectId: string }) {
  const [open, setOpen] = useSessionStorage<boolean>(
    `${OPEN_STORAGE_KEY_PREFIX}:${projectId}`,
    defaultOpen ?? false,
  );
  const [clientStore] = useState(createInAppAgentClientStore);

  return (
    <InAppAiAgentProviderInner
      projectId={projectId}
      open={open}
      setOpen={setOpen}
      clientStore={clientStore}
    >
      {children}
    </InAppAiAgentProviderInner>
  );
}

type AgentRuntime = {
  agent: HttpAgent;
  subscription: ReturnType<HttpAgent["subscribe"]> | null;
  activeRunId: string | null;
};

type RunResult = "completed" | "failed" | "rate_limited";

function InAppAiAgentProviderInner({
  children,
  projectId,
  open,
  setOpen,
  clientStore,
}: PropsWithChildren<{
  projectId: string;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  clientStore: ReturnType<typeof createInAppAgentClientStore>;
}>) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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
  const runtimesRef = useRef(new Map<string, AgentRuntime>());
  const pumpConversationRef = useRef<(conversationId: string) => void>(
    () => undefined,
  );
  const executeRunRef = useRef<
    (
      conversationId: string,
      runtime: AgentRuntime,
      context: InAppAgentQueuedMessage["context"],
      parameters?: Parameters<HttpAgent["runAgent"]>[0],
      retryOnRateLimit?: boolean,
      throwOnFailure?: boolean,
    ) => Promise<RunResult>
  >(async () => "failed");
  const actions = clientStore.getState().actions;
  const allClientConversations = useStore(
    clientStore,
    (state) => state.conversations,
  );
  const localConversations = useStore(
    clientStore,
    (state) => state.localConversations,
  );

  const conversationListQuery =
    api.inAppAgent.listConversations.useInfiniteQuery(
      { projectId },
      {
        enabled: open,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );
  const remoteConversations = useMemo(
    () =>
      conversationListQuery.data?.pages.flatMap((page) => page.conversations) ??
      [],
    [conversationListQuery.data?.pages],
  );
  const selectedClientKey =
    _selectedConversationId ?? NEW_CONVERSATION_DRAFT_KEY;
  const selectedClientState = useStore(
    clientStore,
    (state) =>
      state.conversations[selectedClientKey] ??
      EMPTY_IN_APP_AGENT_CONVERSATION_STATE,
  );
  const conversationQuery = api.inAppAgent.getConversation.useQuery(
    { projectId, conversationId: _selectedConversationId ?? "" },
    {
      enabled:
        open &&
        Boolean(_selectedConversationId) &&
        !selectedClientState.isSubmitting,
    },
  );
  const deleteConversationMutation =
    api.inAppAgent.deleteConversation.useMutation();
  const feedbackMutation = api.inAppAgent.submitFeedback.useMutation();
  const isSelectedConversationNotFound =
    conversationQuery.error?.data?.code === "NOT_FOUND" &&
    !localConversations[_selectedConversationId ?? ""];
  const selectedConversationId = isSelectedConversationNotFound
    ? null
    : _selectedConversationId;

  const conversations = useMemo<InAppAiAgentConversation[]>(() => {
    const remoteIds = new Set(remoteConversations.map(({ id }) => id));
    const localOnlyConversations: InAppAiAgentConversation[] = Object.values(
      localConversations,
    ).filter(({ id }) => !remoteIds.has(id));
    const merged = localOnlyConversations.concat(remoteConversations);

    return merged.map((conversation) => {
      const state = allClientConversations[conversation.id];
      return {
        ...conversation,
        activity: state
          ? {
              isRunning: state.isRunning || state.isSubmitting,
              requiresApproval: state.pendingToolApprovals.length > 0,
              queuedCount: state.queuedMessages.length,
            }
          : undefined,
      };
    });
  }, [allClientConversations, localConversations, remoteConversations]);
  const selectedConversationIsWriteLocked =
    conversationQuery.data?.conversation.isWriteLocked ??
    conversations.find(({ id }) => id === selectedConversationId)
      ?.isWriteLocked ??
    false;
  const hasMoreConversations = conversationListQuery.hasNextPage === true;
  const isLoadingMoreConversations = conversationListQuery.isFetchingNextPage;
  const isSelectedConversationHydrating =
    Boolean(selectedConversationId) &&
    !localConversations[selectedConversationId ?? ""] &&
    conversationQuery.isLoading &&
    !conversationQuery.data;

  const storedMessages =
    conversationQuery.data?.conversation.id === selectedConversationId
      ? conversationQuery.data.messages.filter(isAgentConversationMessage)
      : undefined;
  const currentMessages = isSelectedConversationNotFound
    ? EMPTY_MESSAGES
    : !selectedClientState.isRunning &&
        storedMessages &&
        selectedClientState.messages.length <= storedMessages.length
      ? storedMessages
      : selectedClientState.messages;
  const messagesWithUiState = useMemo(() => {
    const messagesWithFeedback = mergeMessagesWithFeedback(
      currentMessages,
      selectedConversationId
        ? feedbackByConversationId[selectedConversationId]
        : undefined,
    );

    return messagesWithFeedback.map((message) => {
      if (message.role === "reasoning") {
        return {
          ...message,
          isLoading: selectedClientState.loadingEventIds.has(message.id),
        };
      }
      if (message.role !== "assistant") {
        return message;
      }
      return {
        ...message,
        isLoading:
          selectedClientState.loadingEventIds.has(message.id) ||
          (message.toolCalls?.some(
            (toolCall) =>
              toolCall.function.name !== IN_APP_AGENT_REDIRECT_TOOL_NAME &&
              selectedClientState.loadingEventIds.has(toolCall.id),
          ) ??
            false),
      };
    });
  }, [
    currentMessages,
    feedbackByConversationId,
    selectedClientState.loadingEventIds,
    selectedConversationId,
  ]);

  const updateConversation = useCallback(
    (
      conversationId: string,
      update: Parameters<typeof actions.updateConversation>[1],
    ) => {
      actions.updateConversation(conversationId, update);
    },
    [actions],
  );

  const buildContext = useCallback(
    (options?: InAppAgentSubmitOptions) =>
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
        options?.quickAction
          ? createInAppAgentQuickActionAttributionContext(options.quickAction)
          : [],
        createInAppAgentMessageEntryPointContext(options?.entryPoint ?? "chat"),
      ),
    [session.data?.user?.name],
  );

  const updateLoadingEvent = useCallback(
    (conversationId: string, eventId: string, isLoading: boolean) => {
      updateConversation(conversationId, (current) => {
        if (current.loadingEventIds.has(eventId) === isLoading) {
          return current;
        }
        const loadingEventIds = new Set(current.loadingEventIds);
        if (isLoading) {
          loadingEventIds.add(eventId);
        } else {
          loadingEventIds.delete(eventId);
        }
        return { ...current, loadingEventIds };
      });
    },
    [updateConversation],
  );

  const publishLiveMessages = useCallback(
    (
      conversationId: string,
      messages: AgUiMessage[],
      activeRunId: string | null,
    ) => {
      updateConversation(conversationId, (current) => ({
        ...current,
        messages: attachActiveRunIdToAssistantMessages(messages, activeRunId),
        liveMessageVersion: current.liveMessageVersion + 1,
      }));
    },
    [updateConversation],
  );

  const getOrCreateRuntime = useCallback(
    (
      conversationId: string,
      initialMessages: AgUiMessage[],
      isNewConversation: boolean,
    ) => {
      const existing = runtimesRef.current.get(conversationId);
      if (existing) {
        return existing;
      }

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
      const runtime: AgentRuntime = {
        agent,
        activeRunId: null,
        subscription: null,
      };
      runtime.subscription = agent.subscribe({
        onRunStartedEvent: ({ event }) => {
          const parsedEvent = z.object({ runId: z.string() }).safeParse(event);
          if (parsedEvent.success) {
            runtime.activeRunId = parsedEvent.data.runId;
          }
        },
        onEvent: ({ event }) => {
          if (
            event.type === EventType.REASONING_MESSAGE_START ||
            event.type === EventType.TEXT_MESSAGE_START
          ) {
            updateLoadingEvent(conversationId, event.messageId, true);
          } else if (
            event.type === EventType.REASONING_MESSAGE_END ||
            event.type === EventType.TEXT_MESSAGE_END
          ) {
            updateLoadingEvent(conversationId, event.messageId, false);
          } else if (event.type === EventType.TOOL_CALL_START) {
            updateLoadingEvent(conversationId, event.toolCallId, true);
          } else if (event.type === EventType.TOOL_CALL_RESULT) {
            updateLoadingEvent(conversationId, event.toolCallId, false);
          } else if (
            event.type === EventType.RUN_FINISHED ||
            event.type === EventType.RUN_ERROR
          ) {
            updateConversation(conversationId, (current) => ({
              ...current,
              loadingEventIds: new Set(),
            }));
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
          updateConversation(conversationId, (current) => ({
            ...current,
            pendingToolApprovals: replaceApproval(
              current.pendingToolApprovals,
              approval,
            ),
          }));
        },
        onToolCallResultEvent: ({ event }) => {
          updateConversation(conversationId, (current) => ({
            ...current,
            pendingToolApprovals: current.pendingToolApprovals.filter(
              ({ approvalRequest }) =>
                approvalRequest.toolCallId !== event.toolCallId,
            ),
          }));
        },
        onRunErrorEvent: ({ event }) => {
          updateConversation(conversationId, (current) => ({
            ...current,
            error: getInAppAgentError(event),
          }));
          console.warn("In-app agent drawer run error", event);
        },
        onMessagesChanged: ({ messages }) => {
          publishLiveMessages(
            conversationId,
            messages.filter(isAgentConversationMessage),
            runtime.activeRunId,
          );
        },
        onStateChanged: ({ messages }) => {
          publishLiveMessages(
            conversationId,
            messages.filter(isAgentConversationMessage),
            runtime.activeRunId,
          );
        },
      });
      runtimesRef.current.set(conversationId, runtime);
      return runtime;
    },
    [projectId, publishLiveMessages, updateConversation, updateLoadingEvent],
  );

  const executeRun = useCallback(
    async (
      conversationId: string,
      runtime: AgentRuntime,
      context: InAppAgentQueuedMessage["context"],
      parameters?: Parameters<HttpAgent["runAgent"]>[0],
      retryOnRateLimit = false,
      throwOnFailure = false,
    ): Promise<RunResult> => {
      updateConversation(conversationId, (current) => ({
        ...current,
        error: null,
        isRunning: true,
        isSubmitting: false,
        loadingEventIds: new Set(),
      }));
      let result: RunResult = "completed";

      try {
        await runtime.agent.runAgent({ ...parameters, context });
      } catch (error) {
        const agentError = getInAppAgentError(error);
        const retryAt =
          agentError.type === "rate_limit" ? agentError.retryAt : null;
        result = retryAt === null ? "failed" : "rate_limited";
        updateConversation(conversationId, (current) => ({
          ...current,
          error: agentError,
        }));
        console.warn("In-app agent drawer error", error);

        if (retryAt !== null && retryOnRateLimit) {
          window.setTimeout(
            () => {
              updateConversation(conversationId, (current) => ({
                ...current,
                error: null,
              }));
              executeRunRef
                .current(conversationId, runtime, context, parameters, true)
                .then((retryResult) => {
                  if (retryResult !== "rate_limited") {
                    pumpConversationRef.current(conversationId);
                  }
                })
                .catch((error: unknown) => {
                  console.warn("Failed to retry in-app agent run", error);
                });
            },
            Math.max(0, retryAt - Date.now()),
          );
        }
        if (throwOnFailure) {
          throw error;
        }
      } finally {
        const activeRunId = runtime.activeRunId;
        runtime.activeRunId = null;
        updateConversation(conversationId, (current) => ({
          ...current,
          isRunning: false,
          isSubmitting: false,
          loadingEventIds: new Set(),
          messages: attachActiveRunIdToAssistantMessages(
            runtime.agent.messages.filter(isAgentConversationMessage),
            activeRunId,
          ),
        }));
        Promise.all([
          utils.inAppAgent.listConversations.invalidate({ projectId }),
          utils.inAppAgent.getConversation.invalidate({
            projectId,
            conversationId,
          }),
        ]).catch((error: unknown) => {
          console.warn("Failed to refresh in-app agent conversation", error);
        });
      }

      return result;
    },
    [
      projectId,
      updateConversation,
      utils.inAppAgent.getConversation,
      utils.inAppAgent.listConversations,
    ],
  );
  executeRunRef.current = executeRun;

  const dispatchNextQueuedMessage = useCallback(
    async (conversationId: string) => {
      const before =
        clientStore.getState().conversations[conversationId] ??
        EMPTY_IN_APP_AGENT_CONVERSATION_STATE;
      const queuedMessage = before.queuedMessages[0];
      if (!queuedMessage) {
        return;
      }

      updateConversation(conversationId, (current) => ({
        ...current,
        isSubmitting: true,
        queuedMessages: current.queuedMessages.slice(1),
      }));

      try {
        const initialMessages = before.messages.length
          ? before.messages
          : conversationQuery.data?.conversation.id === conversationId
            ? conversationQuery.data.messages.filter(isAgentConversationMessage)
            : [];
        const runtime = getOrCreateRuntime(
          conversationId,
          initialMessages,
          Boolean(localConversations[conversationId]) &&
            initialMessages.length === 0,
        );
        const userMessage = {
          id: createInAppAgentMessageId(),
          role: "user",
          content: queuedMessage.content,
        } satisfies AgUiMessage;
        runtime.agent.addMessage(userMessage);
        updateConversation(conversationId, (current) => ({
          ...current,
          messages: runtime.agent.messages.filter(isAgentConversationMessage),
        }));

        const entryPoint = queuedMessage.options?.entryPoint ?? "chat";
        if (
          localConversations[conversationId] &&
          initialMessages.length === 0
        ) {
          capture("in_app_agent:new_chat_started", { entryPoint });
        }
        capture("in_app_agent:new_chat_turn", { entryPoint });
        const result = await executeRun(
          conversationId,
          runtime,
          queuedMessage.context,
          undefined,
          true,
        );
        if (result !== "rate_limited") {
          pumpConversationRef.current(conversationId);
        }
      } catch (error) {
        updateConversation(conversationId, (current) => ({
          ...current,
          error: getInAppAgentError(error),
          isSubmitting: false,
          queuedMessages: [queuedMessage].concat(current.queuedMessages),
        }));
        console.warn("Failed to start in-app agent conversation", error);
      }
    },
    [
      capture,
      clientStore,
      conversationQuery.data,
      executeRun,
      getOrCreateRuntime,
      localConversations,
      updateConversation,
    ],
  );

  const pumpConversation = useCallback(
    (conversationId: string) => {
      const state =
        clientStore.getState().conversations[conversationId] ??
        EMPTY_IN_APP_AGENT_CONVERSATION_STATE;
      const isBusy =
        state.isRunning ||
        state.isSubmitting ||
        state.pendingToolApprovals.length > 0 ||
        isInAppAgentRateLimited(state.error);
      if (!isBusy && state.queuedMessages.length > 0) {
        dispatchNextQueuedMessage(conversationId).catch((error: unknown) => {
          console.warn("Failed to dispatch queued in-app agent message", error);
        });
      }
    },
    [clientStore, dispatchNextQueuedMessage],
  );
  pumpConversationRef.current = pumpConversation;

  useEffect(() => {
    const runtimes = runtimesRef.current;
    return () => {
      for (const { agent, subscription } of runtimes.values()) {
        subscription?.unsubscribe();
        agent.abortRun();
      }
      runtimes.clear();
    };
  }, []);

  useEffect(() => {
    if (!conversationListQuery.error) {
      return;
    }
    const errorMessage = getAgentErrorMessage(conversationListQuery.error);
    showErrorToast("Failed to load conversations", errorMessage);
    console.warn("Failed to load in-app agent conversations", {
      error: conversationListQuery.error,
      projectId,
    });
  }, [conversationListQuery.error, projectId]);

  const loadMoreConversations = useCallback(() => {
    if (!hasMoreConversations || isLoadingMoreConversations) {
      return;
    }
    conversationListQuery.fetchNextPage().catch((error) => {
      showErrorToast(
        "Failed to load conversations",
        getAgentErrorMessage(error),
      );
      console.warn("Failed to load in-app agent conversations", error);
    });
  }, [conversationListQuery, hasMoreConversations, isLoadingMoreConversations]);
  const invalidateConversations = useCallback(
    () => utils.inAppAgent.listConversations.invalidate({ projectId }),
    [projectId, utils.inAppAgent.listConversations],
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      if (conversationId === _selectedConversationId) {
        return;
      }
      setSelectedConversationId(conversationId);
    },
    [_selectedConversationId, setSelectedConversationId],
  );

  const setDraft = useCallback(
    (draft: string) => {
      updateConversation(selectedClientKey, (current) => ({
        ...current,
        draft,
      }));
    },
    [selectedClientKey, updateConversation],
  );
  const editQueuedMessage = useCallback(
    (messageId: string, content: string) => {
      const trimmedContent = content.trim();
      if (!selectedConversationId || !trimmedContent) {
        return;
      }
      updateConversation(selectedConversationId, (current) => ({
        ...current,
        queuedMessages: current.queuedMessages.map((message) =>
          message.id === messageId
            ? { ...message, content: trimmedContent }
            : message,
        ),
      }));
    },
    [selectedConversationId, updateConversation],
  );
  const deleteQueuedMessage = useCallback(
    (messageId: string) => {
      if (!selectedConversationId) {
        return;
      }
      updateConversation(selectedConversationId, (current) => ({
        ...current,
        queuedMessages: current.queuedMessages.filter(
          (message) => message.id !== messageId,
        ),
      }));
    },
    [selectedConversationId, updateConversation],
  );
  const submit = useCallback(
    async (content: string, options?: InAppAgentSubmitOptions) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        return false;
      }
      const isNewConversation =
        options?.newConversation === true || !selectedConversationId;
      if (!isNewConversation && isSelectedConversationHydrating) {
        return false;
      }
      if (
        !isNewConversation &&
        selectedConversationId &&
        selectedConversationIsWriteLocked
      ) {
        updateConversation(selectedConversationId, (current) => ({
          ...current,
          error: {
            type: "generic",
            message: SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
          },
        }));
        return false;
      }

      const conversationId = isNewConversation
        ? createInAppAgentConversationId()
        : selectedConversationId;
      if (!conversationId) {
        return false;
      }
      const current =
        clientStore.getState().conversations[conversationId] ??
        EMPTY_IN_APP_AGENT_CONVERSATION_STATE;
      if (isInAppAgentRateLimited(current.error)) {
        return false;
      }

      if (isNewConversation) {
        actions.rememberLocalConversation(
          conversationId,
          trimmedContent.slice(0, 80),
        );
        actions.updateConversation(
          NEW_CONVERSATION_DRAFT_KEY,
          (draftState) => ({
            ...draftState,
            draft: "",
          }),
        );
        setSelectedConversationId(conversationId);
      }

      const queuedMessage: InAppAgentQueuedMessage = {
        id: createInAppAgentMessageId(),
        content: trimmedContent,
        context: buildContext(options),
        options,
      };
      const isBusy =
        current.isRunning ||
        current.isSubmitting ||
        current.pendingToolApprovals.length > 0 ||
        runtimesRef.current.get(conversationId)?.agent.isRunning === true;
      updateConversation(conversationId, (state) => ({
        ...state,
        error: null,
        draft: "",
        queuedMessages: state.queuedMessages.concat(queuedMessage),
      }));
      if (isBusy) {
        capture("in_app_agent:message_queued", {
          queueDepth: current.queuedMessages.length + 1,
        });
      }
      pumpConversationRef.current(conversationId);
      return true;
    },
    [
      actions,
      buildContext,
      capture,
      clientStore,
      isSelectedConversationHydrating,
      selectedConversationId,
      selectedConversationIsWriteLocked,
      setSelectedConversationId,
      updateConversation,
    ],
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const state = allClientConversations[conversationId];
      if (
        state &&
        (state.isRunning ||
          state.isSubmitting ||
          state.pendingToolApprovals.length > 0 ||
          state.queuedMessages.length > 0)
      ) {
        return;
      }
      try {
        await deleteConversationMutation.mutateAsync({
          projectId,
          conversationId,
        });
        if (conversationId === selectedConversationId) {
          setSelectedConversationId(null);
        }
        actions.removeConversation(conversationId);
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
        showErrorToast(
          "Failed to delete conversation",
          getAgentErrorMessage(error),
        );
        console.warn("Failed to delete in-app agent conversation", error);
        throw error;
      }
    },
    [
      actions,
      allClientConversations,
      deleteConversationMutation,
      projectId,
      selectedConversationId,
      setFeedbackByConversationId,
      setSelectedConversationId,
      utils.inAppAgent.getConversation,
      utils.inAppAgent.listConversations,
    ],
  );

  const resumeToolApproval = useCallback(
    async (approvalId: string, approved: boolean) => {
      if (!selectedConversationId || selectedConversationIsWriteLocked) {
        return;
      }
      const state =
        clientStore.getState().conversations[selectedConversationId] ??
        EMPTY_IN_APP_AGENT_CONVERSATION_STATE;
      const approval = state.pendingToolApprovals.find(
        ({ id }) => id === approvalId,
      );
      const runtime = runtimesRef.current.get(selectedConversationId);
      if (
        !approval ||
        !runtime ||
        state.isRunning ||
        isInAppAgentRateLimited(state.error)
      ) {
        return;
      }
      updateConversation(selectedConversationId, (current) => ({
        ...current,
        pendingToolApprovals: current.pendingToolApprovals.map((item) =>
          item.id === approvalId ? { ...item, status: "submitting" } : item,
        ),
      }));

      try {
        await executeRun(
          selectedConversationId,
          runtime,
          buildContext(),
          {
            runId: createInAppAgentRunId(),
            forwardedProps: {
              command: {
                resume: {
                  approved,
                  approvalRequest: approval.approvalRequest,
                },
              },
            },
          },
          false,
          true,
        );
        updateConversation(selectedConversationId, (current) => ({
          ...current,
          pendingToolApprovals: current.pendingToolApprovals.filter(
            ({ id }) => id !== approvalId,
          ),
        }));
        pumpConversationRef.current(selectedConversationId);
      } catch (error) {
        const isStaleApproval =
          getAgentErrorMessage(error) === "Invalid forwarded props";
        updateConversation(selectedConversationId, (current) => ({
          ...current,
          error: isStaleApproval
            ? {
                type: "generic",
                message:
                  "This tool approval is no longer valid. Please try again.",
              }
            : current.error,
          pendingToolApprovals: isStaleApproval
            ? current.pendingToolApprovals.filter(({ id }) => id !== approvalId)
            : current.pendingToolApprovals.map((item) =>
                item.id === approvalId ? { ...item, status: "pending" } : item,
              ),
        }));
        if (isStaleApproval) {
          pumpConversationRef.current(selectedConversationId);
        }
      }
    },
    [
      buildContext,
      clientStore,
      executeRun,
      selectedConversationId,
      selectedConversationIsWriteLocked,
      updateConversation,
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
          if (Object.keys(conversationFeedback).length) {
            nextFeedback[selectedConversationId] = conversationFeedback;
          } else {
            delete nextFeedback[selectedConversationId];
          }
          return nextFeedback;
        });
      } catch (error) {
        showErrorToast("Failed to save feedback", getAgentErrorMessage(error));
        console.warn("Failed to save in-app agent feedback", error);
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

  const value = useMemo<InAppAiAgentContextType>(
    () => ({
      isAvailable: true,
      open,
      setOpen: setAgentOpen,
      openAssistant,
      isExpanded,
      setIsExpanded,
      isRunning: selectedClientState.isRunning,
      isSubmitting: selectedClientState.isSubmitting,
      pendingToolApprovals: isSelectedConversationNotFound
        ? []
        : selectedClientState.pendingToolApprovals,
      queuedMessages: selectedClientState.queuedMessages,
      draft: selectedClientState.draft,
      isSelectedConversationHydrating,
      error: selectedClientState.error,
      messages: messagesWithUiState,
      liveMessageVersion: selectedClientState.liveMessageVersion,
      conversations,
      hasMoreConversations,
      isLoadingMoreConversations,
      selectedConversationId: selectedConversationId ?? undefined,
      selectedConversationIsWriteLocked,
      loadMoreConversations,
      invalidateConversations,
      selectConversation,
      deleteConversation,
      setDraft,
      editQueuedMessage,
      deleteQueuedMessage,
      submit,
      approveToolCall,
      rejectToolCall,
      submitFeedback,
    }),
    [
      approveToolCall,
      conversations,
      deleteConversation,
      deleteQueuedMessage,
      editQueuedMessage,
      hasMoreConversations,
      invalidateConversations,
      isExpanded,
      isLoadingMoreConversations,
      isSelectedConversationHydrating,
      isSelectedConversationNotFound,
      loadMoreConversations,
      messagesWithUiState,
      open,
      openAssistant,
      rejectToolCall,
      selectConversation,
      selectedClientState,
      selectedConversationId,
      selectedConversationIsWriteLocked,
      setAgentOpen,
      setDraft,
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
  return AgUiMessageSchema.safeParse(message).success;
}

function mergeMessagesWithFeedback(
  messages: AgUiMessage[],
  feedbackByMessageId: Record<string, InAppAgentMessageFeedback> | undefined,
): AgUiMessage[] {
  if (!feedbackByMessageId || Object.keys(feedbackByMessageId).length === 0) {
    return messages;
  }
  return messages.map((message) =>
    message.role === "assistant" && feedbackByMessageId[message.id]
      ? { ...message, feedback: feedbackByMessageId[message.id] }
      : message,
  );
}

function attachActiveRunIdToAssistantMessages(
  messages: AgUiMessage[],
  runId: string | null,
): AgUiMessage[] {
  if (!runId) {
    return messages;
  }
  return messages.map((message) =>
    message.role === "assistant" && !message.runId
      ? { ...message, runId }
      : message,
  );
}

function replaceApproval(
  approvals: InAppAgentPendingToolApproval[],
  approval: InAppAgentPendingToolApproval,
) {
  const existingIndex = approvals.findIndex(({ id }) => id === approval.id);
  if (existingIndex === -1) {
    return approvals.concat(approval);
  }
  const nextApprovals = approvals.slice();
  nextApprovals[existingIndex] = approval;
  return nextApprovals;
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
  };
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
  return useContext(InAppAiAgentContext) ?? NOOP_CONTEXT;
}

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
