import { useSyncExternalStore } from "react";

type EvaluatorAssistantTestResult = {
  toolCallId: string;
  result: unknown;
};

type Listener = () => void;
type ResultExpectation = {
  conversationId: string;
  observationId: string | null;
};
type ResultEntry = ResultExpectation & Partial<EvaluatorAssistantTestResult>;
type ResultSnapshot = ReadonlyMap<string, ResultEntry>;

const EMPTY_SNAPSHOT: ResultSnapshot = new Map();
const MAX_RESULTS = 50;
const DEFAULT_RESULT_TTL_MS = 10 * 60 * 1000;

function resultKey(projectId: string, evaluatorId: string) {
  return `${projectId}:${evaluatorId}`;
}

export function createEvaluatorAssistantTestResultStore({
  ttlMs = DEFAULT_RESULT_TTL_MS,
}: {
  ttlMs?: number;
} = {}) {
  let snapshot: ResultSnapshot = EMPTY_SNAPSHOT;
  const listeners = new Set<Listener>();
  const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const notify = () => {
    for (const listener of listeners) listener();
  };
  const clearKey = (key: string) => {
    if (!snapshot.has(key)) return;

    const timer = expiryTimers.get(key);
    if (timer) clearTimeout(timer);
    expiryTimers.delete(key);

    const next = new Map(snapshot);
    next.delete(key);
    snapshot = next.size > 0 ? next : EMPTY_SNAPSHOT;
    notify();
  };
  const scheduleExpiry = (key: string) => {
    const currentTimer = expiryTimers.get(key);
    if (currentTimer) clearTimeout(currentTimer);
    expiryTimers.set(
      key,
      setTimeout(() => clearKey(key), ttlMs),
    );
  };

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    get(projectId: string, evaluatorId: string) {
      const entry = snapshot.get(resultKey(projectId, evaluatorId));
      return entry?.toolCallId
        ? { toolCallId: entry.toolCallId, result: entry.result }
        : null;
    },
    expect({
      projectId,
      evaluatorId,
      conversationId,
      observationId,
    }: {
      projectId: string;
      evaluatorId: string;
      conversationId: string;
      observationId: string | null;
    }) {
      const key = resultKey(projectId, evaluatorId);
      const next = new Map(snapshot);
      next.set(key, { conversationId, observationId });
      snapshot = next;
      scheduleExpiry(key);
      notify();
    },
    publish({
      projectId,
      evaluatorId,
      conversationId,
      observationId,
      toolCallId,
      result,
    }: {
      projectId: string;
      evaluatorId: string;
      conversationId: string;
      observationId: string | null;
      toolCallId: string;
      result: unknown;
    }) {
      const key = resultKey(projectId, evaluatorId);
      const expected = snapshot.get(key);
      if (
        !expected ||
        expected.conversationId !== conversationId ||
        (expected.observationId !== null &&
          expected.observationId !== observationId)
      ) {
        return;
      }

      const next = new Map(snapshot);
      next.delete(key);
      next.set(key, { ...expected, toolCallId, result });
      if (next.size > MAX_RESULTS) {
        const oldestKey = next.keys().next().value;
        if (oldestKey) {
          const timer = expiryTimers.get(oldestKey);
          if (timer) clearTimeout(timer);
          expiryTimers.delete(oldestKey);
          next.delete(oldestKey);
        }
      }
      snapshot = next;
      scheduleExpiry(key);
      notify();
    },
    clear(projectId: string, evaluatorId: string) {
      clearKey(resultKey(projectId, evaluatorId));
    },
    clearCompletedProjectResults(projectId: string) {
      for (const [key, entry] of snapshot) {
        if (key.startsWith(`${projectId}:`) && entry.toolCallId) {
          clearKey(key);
        }
      }
    },
  };
}

export const evaluatorAssistantTestResultStore =
  createEvaluatorAssistantTestResultStore();

export function useEvaluatorAssistantTestResult(
  projectId: string,
  evaluatorId: string,
) {
  const snapshot = useSyncExternalStore(
    evaluatorAssistantTestResultStore.subscribe,
    evaluatorAssistantTestResultStore.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );

  const entry = snapshot.get(resultKey(projectId, evaluatorId));
  return entry?.toolCallId
    ? { toolCallId: entry.toolCallId, result: entry.result }
    : null;
}
