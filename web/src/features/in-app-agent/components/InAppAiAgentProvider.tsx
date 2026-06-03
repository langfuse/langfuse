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
import { useRouter } from "next/router";

import useSessionStorage from "@/src/components/useSessionStorage";
import { env } from "@/src/env.mjs";
import {
  AgUiMessageSchema,
  type AgUiMessage,
  type InAppAgentRuntimeState,
} from "@/src/features/in-app-agent/schema";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";

const SELECTED_CONVERSATION_STORAGE_KEY_PREFIX =
  "langfuse:in-app-ai-agent-selected-conversation";
const OPEN_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-open";

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
};

type InAppAiAgentMessage = AgUiMessage;

export type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  updatedAt: Date;
};

type InAppAiAgentContextType = {
  isAvailable: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
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

  if (!projectId) {
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
  const [selectedConversationId, setSelectedConversationId] = useSessionStorage<
    string | null
  >(`${SELECTED_CONVERSATION_STORAGE_KEY_PREFIX}:${projectId}`, null);
  const [messages, setMessages] = useState<InAppAiAgentMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agentRef = useRef<HttpAgent | null>(null);
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

  const conversations = useMemo(
    () =>
      conversationListQuery.data?.pages.flatMap((page) => page.conversations) ??
      [],
    [conversationListQuery.data?.pages],
  );
  const hasMoreConversations = conversationListQuery.hasNextPage === true;
  const isLoadingMoreConversations = conversationListQuery.isFetchingNextPage;
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
      onMessagesChanged: ({ messages }) => {
        setMessages(messages.filter(isAgentConversationMessage));
      },
      onStateChanged: ({ messages }) => {
        setMessages(messages.filter(isAgentConversationMessage));
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
        url: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/in-app-agent`,
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
      const runId = crypto.randomUUID();
      agent
        .runAgent({ runId })
        .catch((error) => {
          if (intentionalAbortRef.current) {
            return;
          }

          const errorMessage = getAgentErrorMessage(error);
          setError(errorMessage);
          console.error("In-app agent drawer error", error);
        })
        .finally(() => {
          setIsRunning(false);
          setMessages(agent.messages.filter(isAgentConversationMessage));
          utils.inAppAgent.listConversations.invalidate({ projectId });
          utils.inAppAgent.getConversation.invalidate({
            projectId,
            conversationId,
          });
          releaseSubmitLock();
          intentionalAbortRef.current = false;
        });
    },
    [
      projectId,
      releaseSubmitLock,
      utils.inAppAgent.getConversation,
      utils.inAppAgent.listConversations,
    ],
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      setError(null);
      resetAgent();
      setMessages([]);
      setSelectedConversationId(conversationId);
    },
    [resetAgent, setSelectedConversationId],
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
        const conversationId = selectedConversationId ?? crypto.randomUUID();

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
        // only the latest user turn; the server ignores older messages.
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
          id: crypto.randomUUID(),
          role: "user",
          content,
        } satisfies AgUiMessage;

        agent.addMessage(userMessage);
        setMessages(agent.messages.filter(isAgentConversationMessage));
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

  const value = useMemo<InAppAiAgentContextType>(
    () => ({
      isAvailable: true,
      open,
      setOpen,
      isRunning,
      isSubmitting,
      isSelectedConversationHydrating,
      error,
      messages,
      conversations,
      hasMoreConversations,
      isLoadingMoreConversations,
      selectedConversationId: selectedConversationId ?? undefined,
      loadMoreConversations,
      selectConversation,
      submit,
    }),
    [
      conversations,
      error,
      hasMoreConversations,
      isLoadingMoreConversations,
      isRunning,
      isSelectedConversationHydrating,
      isSubmitting,
      loadMoreConversations,
      messages,
      open,
      selectConversation,
      selectedConversationId,
      setOpen,
      submit,
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
