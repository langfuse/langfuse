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
const OPEN_STORAGE_KEY = "langfuse:in-app-ai-agent-open";

const getConversationAgentState = (
  projectId: string,
  conversationId: string,
): InAppAgentRuntimeState => ({
  type: "existingConversation",
  projectId,
  conversationId,
});

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
  startNewConversation: () => undefined,
  submit: () => undefined,
};

type InAppAiAgentMessage = AgUiMessage;

export type InAppAiAgentConversation = {
  id: string;
  title: string | null;
  lastMessageAt: Date | null;
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
  selectConversation: (conversationId: string) => void;
  startNewConversation: () => void;
  submit: (content: string) => void;
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
    OPEN_STORAGE_KEY,
    defaultOpen ?? false,
  );

  return (
    <InAppAiAgentProviderInner
      key={projectId}
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
  const submitInFlightRef = useRef(false);
  const subscriptionRef = useRef<ReturnType<HttpAgent["subscribe"]> | null>(
    null,
  );

  const conversationListQuery = api.inAppAgent.list.useInfiniteQuery(
    { projectId },
    {
      enabled: open,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const conversationQuery = api.inAppAgent.get.useQuery(
    {
      projectId,
      conversationId: selectedConversationId ?? "",
    },
    { enabled: open && Boolean(selectedConversationId) },
  );
  const createConversationMutation = api.inAppAgent.create.useMutation();

  const conversations = useMemo(
    () =>
      conversationListQuery.data?.pages.flatMap((page) => page.conversations) ??
      [],
    [conversationListQuery.data?.pages],
  );
  const loadMoreConversations = useCallback(() => {
    if (
      !conversationListQuery.hasNextPage ||
      conversationListQuery.isFetchingNextPage
    ) {
      return;
    }

    conversationListQuery.fetchNextPage().catch((error) => {
      const errorMessage = getAgentErrorMessage(error);
      showErrorToast("Failed to load conversations", errorMessage);
      console.error("Failed to load in-app agent conversations", error);
    });
  }, [conversationListQuery]);
  const isSelectedConversationHydrating =
    Boolean(selectedConversationId) &&
    conversationQuery.isLoading &&
    !conversationQuery.data;
  const resetAgent = useCallback(() => {
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

  // Clear local selection when the selected conversation was deleted remotely.
  useEffect(() => {
    if (
      !selectedConversationId ||
      isRunning ||
      conversationQuery.error?.data?.code !== "NOT_FOUND"
    ) {
      return;
    }

    resetAgent();
    setMessages([]);
    setSelectedConversationId(null);
  }, [
    conversationQuery.error,
    isRunning,
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
    (conversationId: string, initialMessages: InAppAiAgentMessage[]) => {
      if (agentRef.current?.threadId === conversationId) {
        return agentRef.current;
      }

      resetAgent();

      const agent = new HttpAgent({
        url: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/in-app-agent`,
        threadId: conversationId,
        initialMessages,
        initialState: getConversationAgentState(projectId, conversationId),
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
          const errorMessage = getAgentErrorMessage(error);
          setError(errorMessage);
          showErrorToast("Assistant failed", errorMessage);
          console.error("In-app agent drawer error", error);
        })
        .finally(() => {
          setIsRunning(false);
          setMessages(agent.messages.filter(isAgentConversationMessage));
          utils.inAppAgent.list.invalidate({ projectId });
          utils.inAppAgent.get.invalidate({
            projectId,
            conversationId,
          });
          releaseSubmitLock();
        });
    },
    [projectId, releaseSubmitLock, utils.inAppAgent.get, utils.inAppAgent.list],
  );

  const selectConversation = useCallback(
    (conversationId: string) => {
      setError(null);
      resetAgent();
      setMessages([]);
      setSelectedConversationId(conversationId);
    },
    [resetAgent, setSelectedConversationId],
  );

  const startNewConversation = useCallback(() => {
    setError(null);
    resetAgent();
    setMessages([]);
    setSelectedConversationId(null);
  }, [resetAgent, setSelectedConversationId]);

  const submit = useCallback(
    (content: string) => {
      if (
        !content ||
        isRunning ||
        isSelectedConversationHydrating ||
        submitInFlightRef.current
      ) {
        return;
      }

      submitInFlightRef.current = true;
      setIsSubmitting(true);
      setError(null);

      (async () => {
        let startedRun = false;

        try {
          const conversationId =
            selectedConversationId ??
            (
              await createConversationMutation.mutateAsync({
                projectId,
              })
            ).id;

          if (!selectedConversationId) {
            setSelectedConversationId(conversationId);
            utils.inAppAgent.list.invalidate({ projectId });
          }

          const storedMessages =
            conversationQuery.data?.conversation.id === conversationId
              ? conversationQuery.data.messages
              : undefined;
          const initialMessages =
            selectedConversationId === conversationId
              ? getHydratedMessages(messages, storedMessages)
              : [];
          const agent = getOrCreateAgent(conversationId, initialMessages);

          if (agent.isRunning) {
            return;
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
        } catch (error) {
          const errorMessage = getAgentErrorMessage(error);
          setError(errorMessage);
          showErrorToast("Assistant failed", errorMessage);
          console.error("Failed to start in-app agent conversation", error);
        } finally {
          if (!startedRun) {
            releaseSubmitLock();
          }
        }
      })();
    },
    [
      createConversationMutation,
      conversationQuery.data,
      ensureSubscription,
      getOrCreateAgent,
      isSelectedConversationHydrating,
      isRunning,
      messages,
      projectId,
      releaseSubmitLock,
      runAgent,
      selectedConversationId,
      setSelectedConversationId,
      utils.inAppAgent.list,
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
      hasMoreConversations: conversationListQuery.hasNextPage === true,
      isLoadingMoreConversations: conversationListQuery.isFetchingNextPage,
      selectedConversationId: selectedConversationId ?? undefined,
      loadMoreConversations,
      selectConversation,
      startNewConversation,
      submit,
    }),
    [
      conversations,
      conversationListQuery.hasNextPage,
      conversationListQuery.isFetchingNextPage,
      error,
      isRunning,
      isSelectedConversationHydrating,
      isSubmitting,
      loadMoreConversations,
      messages,
      open,
      selectConversation,
      selectedConversationId,
      setOpen,
      startNewConversation,
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
