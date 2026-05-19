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
import { z } from "zod";
import { env } from "@/src/env.mjs";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  AgUiMessageSchema,
  InAppAgentRuntimeStateSchema,
  PersistentInAppAiAgentSessionSchema,
  type InAppAgentRuntimeState,
  type PersistentInAppAiAgentSession,
  type AgUiMessage,
} from "@/src/features/in-app-agent/schema";
import useSessionStorage from "@/src/components/useSessionStorage";

const SESSION_STORAGE_KEY_PREFIX = "langfuse:in-app-ai-agent-session";
const OPEN_STORAGE_KEY = "langfuse:in-app-ai-agent-open";

const getInitialAgentState = (projectId: string): InAppAgentRuntimeState => ({
  type: "newSession",
  projectId,
});

const getEmptySession = (projectId: string): PersistentInAppAiAgentSession => ({
  state: getInitialAgentState(projectId),
  messages: [],
});

const NOOP_CONTEXT: InAppAiAgentContextType = {
  isAvailable: false,
  open: false,
  setOpen: () => undefined,
  isRunning: false,
  error: null,
  messages: [],
  submit: () => undefined,
};

type InAppAiAgentMessage = Extract<AgUiMessage, { role: "user" | "assistant" }>;

type InAppAiAgentContextType = {
  isAvailable: boolean;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  isRunning: boolean;
  error: string | null;
  messages: InAppAiAgentMessage[];
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
      sessionStorageKey={`${SESSION_STORAGE_KEY_PREFIX}:${projectId}`}
      open={open}
      setOpen={setOpen}
    >
      {children}
    </InAppAiAgentProviderInner>
  );
}

type InAppAiAgentProviderInnerProps = PropsWithChildren<{
  projectId: string;
  sessionStorageKey: string;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}>;

function InAppAiAgentProviderInner({
  children,
  projectId,
  sessionStorageKey,
  open,
  setOpen,
}: InAppAiAgentProviderInnerProps) {
  const [storedSession, setStoredSession] =
    useSessionStorage<PersistentInAppAiAgentSession>(
      sessionStorageKey,
      getEmptySession(projectId),
    );

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agentRef = useRef<HttpAgent | null>(null);
  const subscriptionRef = useRef<ReturnType<HttpAgent["subscribe"]> | null>(
    null,
  );

  const restoredSession = useMemo(() => {
    const result = PersistentInAppAiAgentSessionSchema.safeParse(storedSession);

    return result.success ? result.data : getEmptySession(projectId);
  }, [projectId, storedSession]);

  const restoredMessages = useMemo(
    () => restoredSession.messages.filter(isAgentConversationMessage),
    [restoredSession.messages],
  );

  const persistSession = useCallback(
    (params: {
      agent: { threadId: string };
      messages: readonly unknown[];
      state: unknown;
    }) => {
      const state = InAppAgentRuntimeStateSchema.safeParse(params.state);

      setStoredSession((previousStoredSession) => {
        const previousSession = PersistentInAppAiAgentSessionSchema.safeParse(
          previousStoredSession,
        );
        const previousMessages = previousSession.success
          ? previousSession.data.messages.filter(isAgentConversationMessage)
          : [];
        const incomingMessages = z
          .array(AgUiMessageSchema)
          .safeParse(params.messages);

        const incomingMessageIds = new Set(
          incomingMessages.success
            ? incomingMessages.data.map((message) => message.id)
            : [],
        );
        const result = PersistentInAppAiAgentSessionSchema.safeParse({
          threadId: params.agent.threadId,
          state: state.success ? state.data : getInitialAgentState(projectId),
          messages: incomingMessages.success
            ? [
                ...previousMessages.filter(
                  (message) => !incomingMessageIds.has(message.id),
                ),
                ...incomingMessages.data.filter(isAgentConversationMessage),
              ]
            : previousMessages,
        });

        return result.success ? result.data : getEmptySession(projectId);
      });
    },
    [projectId, setStoredSession],
  );

  const ensureSubscription = useCallback(
    (agent: HttpAgent) => {
      if (subscriptionRef.current) {
        return;
      }

      subscriptionRef.current = agent.subscribe({
        onMessagesChanged: ({ messages, state, agent }) => {
          persistSession({
            agent,
            messages,
            state,
          });
        },
        onStateChanged: ({ messages, state, agent }) => {
          persistSession({
            agent,
            messages,
            state,
          });
        },
      });
    },
    [persistSession],
  );

  const runAgent = useCallback(
    (agent: HttpAgent, retryOnInvalidSession = true) => {
      persistSession({
        agent,
        messages: agent.messages,
        state: agent.state,
      });
      setIsRunning(true);
      let retriedWithFreshSession = false;

      void agent
        .runAgent()
        .catch((error) => {
          if (retryOnInvalidSession && isInvalidSessionTokenError(error)) {
            retriedWithFreshSession = true;
            subscriptionRef.current?.unsubscribe();
            subscriptionRef.current = null;
            agent.abortRun();

            const freshAgent = new HttpAgent({
              url: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/in-app-agent`,
              threadId: agent.threadId,
              initialMessages: agent.messages.filter(
                isAgentConversationMessage,
              ),
              initialState: getInitialAgentState(projectId),
            });

            agentRef.current = freshAgent;
            ensureSubscription(freshAgent);
            runAgent(freshAgent, false);
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
          persistSession({
            agent,
            messages: agent.messages,
            state: agent.state,
          });
        });
    },
    [ensureSubscription, persistSession, projectId],
  );

  useEffect(() => {
    return () => {
      subscriptionRef.current?.unsubscribe();
      agentRef.current?.abortRun();
    };
  }, []);

  const submit = useCallback(
    (content: string) => {
      if (!content) {
        return;
      }

      setError(null);

      // Create the agent if none exists
      if (!agentRef.current) {
        agentRef.current = new HttpAgent({
          url: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/in-app-agent`,
          threadId: restoredSession.threadId,
          initialMessages: restoredMessages,
          initialState: restoredSession.state,
        });
      }

      const agent = agentRef.current;

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
      runAgent(agent);
    },
    [ensureSubscription, restoredMessages, restoredSession, runAgent],
  );

  const value = useMemo<InAppAiAgentContextType>(
    () => ({
      isAvailable: true,
      open,
      setOpen,
      isRunning,
      error,
      messages: restoredMessages,
      submit,
    }),
    [error, isRunning, open, restoredMessages, setOpen, submit],
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

function isAgentConversationMessage(
  message: unknown,
): message is InAppAiAgentMessage {
  const result = AgUiMessageSchema.safeParse(message);

  return (
    result.success &&
    (result.data.role === "user" || result.data.role === "assistant")
  );
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
