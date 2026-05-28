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
const MAX_SYNC_MESSAGE_DELTAS = 100;

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
  isInputDisabled: false,
  error: null,
  messages: [],
  conversations: [],
  selectedConversationId: undefined,
  selectConversation: () => undefined,
  startNewConversation: () => undefined,
  submit: () => undefined,
};

type InAppAiAgentMessage = Extract<AgUiMessage, { role: "user" | "assistant" }>;

type SyncMessageDelta = {
  message: InAppAiAgentMessage;
  sequenceNumber: number;
  serializedMessage: string;
};

type SyncMessagesOptions = {
  runId?: string;
  runMessageIds?: ReadonlySet<string>;
};

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
  isInputDisabled: boolean;
  error: string | null;
  messages: InAppAiAgentMessage[];
  conversations: InAppAiAgentConversation[];
  selectedConversationId: string | undefined;
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
  const syncedMessagesRef = useRef<Map<string, Map<string, string>>>(new Map());
  const subscriptionRef = useRef<ReturnType<HttpAgent["subscribe"]> | null>(
    null,
  );

  const conversationsQuery = api.inAppAgent.list.useQuery(
    { projectId },
    { enabled: open },
  );
  const conversationQuery = api.inAppAgent.get.useQuery(
    {
      projectId,
      conversationId: selectedConversationId ?? "",
    },
    { enabled: open && Boolean(selectedConversationId) },
  );
  const createConversationMutation = api.inAppAgent.create.useMutation();
  const syncMessagesMutation = api.inAppAgent.syncMessages.useMutation();

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const isSelectedConversationHydrating =
    Boolean(selectedConversationId) &&
    conversationQuery.isLoading &&
    !conversationQuery.data;
  const isInputDisabled =
    isRunning || isSubmitting || isSelectedConversationHydrating;

  const resetAgent = useCallback(() => {
    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = null;
    agentRef.current?.abortRun();
    agentRef.current = null;
  }, []);

  const markMessagesSynced = useCallback(
    (
      conversationId: string,
      syncedMessages: readonly InAppAiAgentMessage[],
    ) => {
      const snapshot =
        syncedMessagesRef.current.get(conversationId) ??
        new Map<string, string>();

      for (const message of syncedMessages) {
        snapshot.set(message.id, serializeMessageForSync(message));
      }

      syncedMessagesRef.current.set(conversationId, snapshot);
    },
    [],
  );

  const markMessageDeltasSynced = useCallback(
    (conversationId: string, messageDeltas: readonly SyncMessageDelta[]) => {
      const snapshot =
        syncedMessagesRef.current.get(conversationId) ??
        new Map<string, string>();

      for (const delta of messageDeltas) {
        snapshot.set(delta.message.id, delta.serializedMessage);
      }

      syncedMessagesRef.current.set(conversationId, snapshot);
    },
    [],
  );

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

    markMessagesSynced(conversationQuery.data.conversation.id, storedMessages);
    resetAgent();
    setMessages(storedMessages);
  }, [
    conversationQuery.data,
    isRunning,
    markMessagesSynced,
    messages.length,
    resetAgent,
    selectedConversationId,
  ]);

  useEffect(() => {
    if (
      !selectedConversationId ||
      isRunning ||
      !isNotFoundTrpcError(conversationQuery.error)
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

  const syncMessages = useCallback(
    (
      conversationId: string,
      nextMessages: readonly unknown[],
      options: SyncMessagesOptions = {},
    ) => {
      const parsedMessages = nextMessages.filter(isAgentConversationMessage);
      setMessages(parsedMessages);

      const messageDeltas = getUnsyncedMessageDeltas(
        parsedMessages,
        syncedMessagesRef.current.get(conversationId),
      );

      if (messageDeltas.length === 0) {
        return;
      }

      void (async () => {
        try {
          const runMessageIds = options.runId
            ? options.runMessageIds
            : undefined;
          const attributedDeltas = runMessageIds
            ? messageDeltas.filter((delta) =>
                runMessageIds.has(delta.message.id),
              )
            : [];
          const unattributedDeltas = runMessageIds
            ? messageDeltas.filter(
                (delta) => !runMessageIds.has(delta.message.id),
              )
            : messageDeltas;

          for (const { deltas, runId } of [
            { deltas: unattributedDeltas },
            { deltas: attributedDeltas, runId: options.runId },
          ]) {
            if (deltas.length === 0) {
              continue;
            }

            for (
              let index = 0;
              index < deltas.length;
              index += MAX_SYNC_MESSAGE_DELTAS
            ) {
              const chunk = deltas.slice(
                index,
                index + MAX_SYNC_MESSAGE_DELTAS,
              );

              await syncMessagesMutation.mutateAsync({
                projectId,
                conversationId,
                ...(runId ? { runId } : {}),
                messages: chunk.map(({ message, sequenceNumber }) => ({
                  message,
                  sequenceNumber,
                })),
              });

              markMessageDeltasSynced(conversationId, chunk);
            }
          }

          void utils.inAppAgent.list.invalidate({ projectId });
          void utils.inAppAgent.get.invalidate({
            projectId,
            conversationId,
          });
        } catch (error) {
          const errorMessage = getAgentErrorMessage(error);
          showErrorToast("Failed to save conversation", errorMessage);
          console.error("Failed to sync in-app agent messages", error);
          void utils.inAppAgent.get.invalidate({
            projectId,
            conversationId,
          });
        }
      })();
    },
    [
      markMessageDeltasSynced,
      projectId,
      syncMessagesMutation,
      utils.inAppAgent.get,
      utils.inAppAgent.list,
    ],
  );

  const ensureSubscription = useCallback(
    (agent: HttpAgent, conversationId: string) => {
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

      syncMessages(conversationId, agent.messages);
    },
    [syncMessages],
  );

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
    (
      agent: HttpAgent,
      conversationId: string,
      retryOnInvalidSession = true,
    ) => {
      syncMessages(conversationId, agent.messages);
      setIsRunning(true);
      const runId = crypto.randomUUID();
      const runStartMessageIds = getMessageIds(agent.messages);
      let retriedWithFreshSession = false;

      void agent
        .runAgent({ runId })
        .catch((error) => {
          if (retryOnInvalidSession && isInvalidSessionTokenError(error)) {
            retriedWithFreshSession = true;
            subscriptionRef.current?.unsubscribe();
            subscriptionRef.current = null;
            agent.abortRun();

            const freshAgent = new HttpAgent({
              url: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/in-app-agent`,
              threadId: conversationId,
              initialMessages: agent.messages.filter(
                isAgentConversationMessage,
              ),
              initialState: getConversationAgentState(
                projectId,
                conversationId,
              ),
            });

            agentRef.current = freshAgent;
            ensureSubscription(freshAgent, conversationId);
            runAgent(freshAgent, conversationId, false);
            return;
          }

          const errorMessage = getAgentErrorMessage(error);
          setError(errorMessage);
          showErrorToast("Assistant failed", errorMessage);
          console.error("In-app agent drawer error", error);
        })
        .finally(() => {
          if (retriedWithFreshSession) {
            return;
          }

          setIsRunning(false);
          const runGeneratedMessageIds = getRunGeneratedMessageIds(
            agent.messages,
            runStartMessageIds,
          );
          syncMessages(
            conversationId,
            agent.messages,
            runGeneratedMessageIds.size > 0
              ? { runId, runMessageIds: runGeneratedMessageIds }
              : undefined,
          );
          releaseSubmitLock();
        });
    },
    [ensureSubscription, projectId, releaseSubmitLock, syncMessages],
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

      void (async () => {
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
            void utils.inAppAgent.list.invalidate({ projectId });
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

          ensureSubscription(agent, conversationId);

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
      isInputDisabled,
      error,
      messages,
      conversations,
      selectedConversationId: selectedConversationId ?? undefined,
      selectConversation,
      startNewConversation,
      submit,
    }),
    [
      conversations,
      error,
      isInputDisabled,
      isRunning,
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

function isInvalidSessionTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const payload = "payload" in error ? error.payload : undefined;

  return (
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    payload.code === "invalid_session_token"
  );
}

function isNotFoundTrpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const data = "data" in error ? error.data : undefined;

  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "NOT_FOUND"
  );
}

function isAgentConversationMessage(
  message: unknown,
): message is InAppAiAgentMessage {
  const result = AgUiMessageSchema.safeParse(message);

  return (
    result.success &&
    (result.data.role === "user" || result.data.role === "assistant")
  );
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

function getUnsyncedMessageDeltas(
  messages: readonly InAppAiAgentMessage[],
  syncedMessages: ReadonlyMap<string, string> | undefined,
): SyncMessageDelta[] {
  return messages.flatMap((message, sequenceNumber) => {
    const serializedMessage = serializeMessageForSync(message);

    if (syncedMessages?.get(message.id) === serializedMessage) {
      return [];
    }

    return [
      {
        message,
        sequenceNumber,
        serializedMessage,
      },
    ];
  });
}

function getMessageIds(messages: readonly unknown[]): ReadonlySet<string> {
  return new Set(
    messages.filter(isAgentConversationMessage).map((message) => message.id),
  );
}

function getRunGeneratedMessageIds(
  messages: readonly unknown[],
  runStartMessageIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    messages
      .filter(isAgentConversationMessage)
      .filter(
        (message) =>
          message.role === "assistant" && !runStartMessageIds.has(message.id),
      )
      .map((message) => message.id),
  );
}

function serializeMessageForSync(message: InAppAiAgentMessage): string {
  return JSON.stringify(message);
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
