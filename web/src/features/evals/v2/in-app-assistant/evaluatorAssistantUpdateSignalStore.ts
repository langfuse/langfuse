import { useSyncExternalStore } from "react";

type SignalSnapshot = ReadonlyMap<string, string>;
type Listener = () => void;

const EMPTY_SNAPSHOT: SignalSnapshot = new Map();
const SIGNAL_TTL_MS = 5_000;
type EvaluatorAssistantUpdateSurface = "code" | "test";

function signalKey(
  projectId: string,
  evaluatorId: string,
  surface: EvaluatorAssistantUpdateSurface,
) {
  return `${projectId}:${evaluatorId}:${surface}`;
}

export function createEvaluatorAssistantUpdateSignalStore() {
  let snapshot: SignalSnapshot = EMPTY_SNAPSHOT;
  const listeners = new Set<Listener>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    publish({
      projectId,
      evaluatorId,
      surface,
      updateId,
    }: {
      projectId: string;
      evaluatorId: string;
      surface: EvaluatorAssistantUpdateSurface;
      updateId: string;
    }) {
      const key = signalKey(projectId, evaluatorId, surface);
      const next = new Map(snapshot);
      next.set(key, updateId);
      snapshot = next;
      notify();

      const currentTimer = timers.get(key);
      if (currentTimer) clearTimeout(currentTimer);
      timers.set(
        key,
        setTimeout(() => {
          if (snapshot.get(key) !== updateId) return;
          const expired = new Map(snapshot);
          expired.delete(key);
          snapshot = expired.size > 0 ? expired : EMPTY_SNAPSHOT;
          timers.delete(key);
          notify();
        }, SIGNAL_TTL_MS),
      );
    },
  };
}

export const evaluatorAssistantUpdateSignalStore =
  createEvaluatorAssistantUpdateSignalStore();

export function useEvaluatorAssistantCodeUpdateSignal(
  projectId: string,
  evaluatorId: string,
) {
  return useEvaluatorAssistantUpdateSignal(projectId, evaluatorId, "code");
}

export function useEvaluatorAssistantTestUpdateSignal(
  projectId: string,
  evaluatorId: string,
) {
  return useEvaluatorAssistantUpdateSignal(projectId, evaluatorId, "test");
}

function useEvaluatorAssistantUpdateSignal(
  projectId: string,
  evaluatorId: string,
  surface: EvaluatorAssistantUpdateSurface,
) {
  const snapshot = useSyncExternalStore(
    evaluatorAssistantUpdateSignalStore.subscribe,
    evaluatorAssistantUpdateSignalStore.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  return snapshot.get(signalKey(projectId, evaluatorId, surface)) ?? null;
}
