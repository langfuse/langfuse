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
import { HttpAgent } from "@ag-ui/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import useSessionStorage from "@/src/components/useSessionStorage";
import { env } from "@/src/env.mjs";
import {
  createInAppAgentConversationId,
  createInAppAgentMessageId,
} from "@/src/ee/features/in-app-agent/ids";
import {
  AgUiMessageSchema,
  type AgUiMessage,
  type InAppAgentMessageFeedback,
  type InAppAgentMessageFeedbackValue,
  type InAppAgentRuntimeState,
} from "@/src/ee/features/in-app-agent/schema";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import {
  createInAppAgentScreenContext,
  createInAppAgentUserContext,
} from "@/src/ee/features/in-app-agent/context";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const SELECTED_CONVERSATION_STORAGE_KEY_PREFIX =
  "langfuse:in-app-ai-agent-selected-conversation";
const OPEN_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-open";
const FEEDBACK_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-feedback";

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
  isExpanded: false,
  setIsExpanded: () => undefined,
  isRunning: false,
  isSubmitting: false,
  isSelectedConversationHydrating: false,
  error: null,
  messages: [],
  conversations: [],
  hasMoreConversations: false,
  isLoadingMoreConversations: false,
  selectedConversationId: undefined,
  loadMoreConversations: () => undefined,
  selectConversation: () => undefined,
  submit: async () => false,
  submitFeedback: async () => undefined,
};

type InAppAiAgentMessage = AgUiMessage;

type InAppAiAgentFeedbackByConversationId = Record<
  string,
  Record<string, InAppAgentMessageFeedback>
>;

export type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
};

type InAppAiAgentContextType = {
  isAvailable: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  isRunning: boolean;
  isSubmitting: boolean;
  isSelectedConversationHydrating: boolean;
  error: string | null;
  messages: InAppAiAgentMessage[];
  conversations: InAppAiAgentConversation[];
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  selectedConversationId: string | undefined;
  loadMoreConversations: () => void;
  selectConversation: (conversationId: string | null) => void;
  submit: (content: string) => Promise<boolean>;
  submitFeedback: (params: {
    messageId: string;
    runId: string;
    value: InAppAgentMessageFeedbackValue | null;
    comment?: string | null;
  }) => Promise<void>;
};

const InAppAiAgentContext = createContext<InAppAiAgentContextType | null>(null);

export interface InAppAiAgentProviderProps extends PropsWithChildren {
  defaultOpen?: boolean;
}

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
  const [selectedConversationId, setSelectedConversationId] = useSessionStorage<
    string | null
  >(`${SELECTED_CONVERSATION_STORAGE_KEY_PREFIX}:${projectId}`, null);
  const [feedbackByConversationId, setFeedbackByConversationId] =
    useSessionStorage<InAppAiAgentFeedbackByConversationId>(
      `${FEEDBACK_STORAGE_KEY_PREFIX}:${projectId}`,
      {},
    );
  const [messages, setMessages] = useState<InAppAiAgentMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      conversationId: selectedConversationId ?? "",
    },
    {
      enabled: open && Boolean(selectedConversationId) && !isSubmitting,
    },
  );
  const feedbackMutation = api.inAppAgent.submitFeedback.useMutation();

  const conversations = useMemo(
    () =>
      conversationListQuery.data?.pages.flatMap((page) => page.conversations) ??
      [],
    [conversationListQuery.data?.pages],
  );
  const hasMoreConversations = conversationListQuery.hasNextPage === true;
  const isLoadingMoreConversations = conversationListQuery.isFetchingNextPage;
  const messagesWithFeedback = useMemo(
    () =>
      mergeMessagesWithFeedback(
        messages,
        selectedConversationId
          ? feedbackByConversationId[selectedConversationId]
          : undefined,
      ),
    [feedbackByConversationId, messages, selectedConversationId],
  );
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
  const resetAgent = useCallback(() => {
    if (agentRef.current?.isRunning) {
      intentionalAbortRef.current = true;
    }

    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
    agentRef.current?.abortRun();
    agentRef.current = null;
    activeRunIdRef.current = null;
  }, []);

  // Hydrate local state from the selected persisted conversation once it loads.
  useEffect(() => {
    if (!selectedConversationId) {
      if (!isRunning) {
        resetAgent();
        setMessages([]);
      }
      return;
    }

    if (!conversationQuery.data || isRunning) {
      return;
    }

    const storedMessages = conversationQuery.data.messages.filter(
      isAgentConversationMessage,
    );

    if (messages.length > storedMessages.length) {
      return;
    }

    resetAgent();
    // TODO: Avoid replacing hydrated messages when only server-generated ids
    // differ from optimistic client ids; this can cause a small post-run flicker.
    setMessages(storedMessages);
  }, [
    conversationQuery.data,
    isRunning,
    messages.length,
    resetAgent,
    selectedConversationId,
  ]);

  // Clear local selection when the selected conversation cannot be loaded.
  useEffect(() => {
    if (!selectedConversationId || isRunning || !conversationQuery.error) {
      return;
    }

    if (conversationQuery.error.data?.code !== "NOT_FOUND") {
      console.error("Failed to load in-app agent conversation", {
        error: conversationQuery.error,
        projectId,
        conversationId: selectedConversationId,
      });
      return;
    }

    resetAgent();
    setMessages([]);
    setSelectedConversationId(null);
  }, [
    conversationQuery.error,
    isRunning,
    projectId,
    resetAgent,
    selectedConversationId,
    setSelectedConversationId,
  ]);

  useEffect(() => {
    return () => {
      resetAgent();
    };
  }, [resetAgent]);

  const ensureSubscription = useCallback((agent: HttpAgent) => {
    if (subscriptionRef.current) {
      return;
    }

    subscriptionRef.current = agent.subscribe({
      onRunStartedEvent: ({ event }) => {
        activeRunIdRef.current = event.runId;
      },
      onRunErrorEvent: ({ event }) => {
        if (intentionalAbortRef.current) {
          return;
        }

        const errorMessage = getAgentErrorMessage(event);
        setError(errorMessage);
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
  }, []);

  const getOrCreateAgent = useCallback(
    (
      conversationId: string,
      initialMessages: InAppAiAgentMessage[],
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
    (agent: HttpAgent, conversationId: string) => {
      setIsRunning(true);
      agent
        .runAgent({
          context: [
            ...createInAppAgentScreenContext({
              currentUrl: window.location.href,
            }),
            ...createInAppAgentUserContext({
              userName: session.data?.user?.name,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              languages:
                navigator.languages.length > 0
                  ? Array.from(navigator.languages)
                  : [navigator.language],
            }),
          ],
        })
        .catch((error) => {
          if (intentionalAbortRef.current) {
            return;
          }

          const errorMessage = getAgentErrorMessage(error);
          setError(errorMessage);
          console.error("In-app agent drawer error", error);
        })
        .finally(() => {
          const runId = activeRunIdRef.current;
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
      releaseSubmitLock,
      session.data?.user?.name,
      utils.inAppAgent.getConversation,
      utils.inAppAgent.listConversations,
    ],
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      if (isRunning || conversationId === selectedConversationId) {
        return;
      }

      setError(null);
      resetAgent();
      setMessages([]);
      setSelectedConversationId(conversationId);
    },
    [isRunning, resetAgent, selectedConversationId, setSelectedConversationId],
  );

  const submit = useCallback(
    async (content: string) => {
      if (
        !content ||
        isRunning ||
        isSelectedConversationHydrating ||
        submitInFlightRef.current
      ) {
        return false;
      }

      submitInFlightRef.current = true;
      setIsSubmitting(true);
      setError(null);

      let startedRun = false;
      try {
        const isNewConversation = !selectedConversationId;
        const conversationId =
          selectedConversationId ?? createInAppAgentConversationId();

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
        if (isNewConversation) {
          capture("in_app_agent:new_chat_started");
        }
        capture("in_app_agent:new_chat_turn");
        startedRun = true;
        runAgent(agent, conversationId);
        return true;
      } catch (error) {
        const errorMessage = getAgentErrorMessage(error);
        setError(errorMessage);
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
      getOrCreateAgent,
      isSelectedConversationHydrating,
      isRunning,
      messages,
      releaseSubmitLock,
      runAgent,
      selectedConversationId,
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

  useEffect(() => {
    if (!open) {
      setIsExpanded(false);
    }
  }, [open]);

  const value = useMemo<InAppAiAgentContextType>(
    () => ({
      isAvailable: true,
      open,
      setOpen,
      isExpanded,
      setIsExpanded,
      isRunning,
      isSubmitting,
      isSelectedConversationHydrating,
      error,
      messages: messagesWithFeedback,
      conversations,
      hasMoreConversations,
      isLoadingMoreConversations,
      selectedConversationId: selectedConversationId ?? undefined,
      loadMoreConversations,
      selectConversation,
      submit,
      submitFeedback,
    }),
    [
      isExpanded,
      conversations,
      error,
      hasMoreConversations,
      isLoadingMoreConversations,
      isRunning,
      isSelectedConversationHydrating,
      isSubmitting,
      loadMoreConversations,
      messagesWithFeedback,
      open,
      selectConversation,
      selectedConversationId,
      setOpen,
      submit,
      submitFeedback,
    ],
  );

  return (
    <InAppAiAgentContext.Provider value={value}>
      {children}
    </InAppAiAgentContext.Provider>
  );
}

function isAgentConversationMessage(
  message: unknown,
): message is InAppAiAgentMessage {
  const result = AgUiMessageSchema.safeParse(message);

  return result.success;
}

function getHydratedMessages(
  localMessages: InAppAiAgentMessage[],
  storedMessages: readonly unknown[] | undefined,
): InAppAiAgentMessage[] {
  if (localMessages.length > 0) {
    return localMessages;
  }

  return storedMessages?.filter(isAgentConversationMessage) ?? [];
}

function mergeMessagesWithFeedback(
  messages: InAppAiAgentMessage[],
  feedbackByMessageId: Record<string, InAppAgentMessageFeedback> | undefined,
): InAppAiAgentMessage[] {
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
  messages: InAppAiAgentMessage[],
  runId: string | null,
): InAppAiAgentMessage[] {
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
