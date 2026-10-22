import { createStore } from "zustand/vanilla";
import { type RouterOutput } from "@/src/utils/types";

type QueueItem = NonNullable<RouterOutput["annotationQueueItems"]["byId"]>;
type Transition = "next" | "back" | "complete";

export type QueueItemLocation = { id: string; observationId?: string };

export type QueueRunDependencies = {
  isActive: () => boolean;
  loadItem: (itemId: string) => Promise<QueueItem | null>;
  loadNext: (seenItemIds: string[]) => Promise<QueueItem | null>;
  cacheItem: (item: QueueItem) => void;
  completeItem: (itemId: string) => Promise<unknown>;
  refreshItems: () => Promise<unknown>;
  navigate: (item: QueueItemLocation, initialize: boolean) => Promise<unknown>;
};

function locationFor(item: QueueItem): QueueItemLocation {
  return {
    id: item.id,
    observationId:
      item.objectType === "OBSERVATION" ? item.objectId : undefined,
  };
}

export function createAnnotationQueueRun({
  initialItemId,
  singleItem,
}: {
  initialItemId?: string;
  singleItem: boolean;
}) {
  let initialRequest: Promise<QueueItem | null> | undefined;
  let pendingNext: QueueItem | undefined;
  const store = createStore<{
    history: QueueItemLocation[];
    progressIndex: number;
    isTransitioning: boolean;
    exhausted: boolean;
    completedItemIds: Set<string>;
    error: { action: Transition; message: string } | null;
  }>(() => ({
    history: [],
    progressIndex: 0,
    isTransitioning: false,
    exhausted: false,
    completedItemIds: new Set(),
    error: null,
  }));

  async function enter(
    dependencies: QueueRunDependencies,
    history: QueueItemLocation[],
    progressIndex: number,
    initialize = false,
  ) {
    if (!dependencies.isActive()) return;
    const navigated = await dependencies.navigate(
      history[progressIndex],
      initialize,
    );
    if (navigated === false) throw new Error("Queue navigation was cancelled");
    store.setState({ history, progressIndex });
  }

  async function advance(dependencies: QueueRunDependencies) {
    if (!dependencies.isActive()) return;
    const { history, progressIndex } = store.getState();
    if (progressIndex + 1 < history.length) {
      await enter(dependencies, history, progressIndex + 1);
      return;
    }
    const next =
      pendingNext ??
      (await dependencies.loadNext(history.map((item) => item.id)));
    if (!dependencies.isActive()) return;
    if (!next) {
      store.setState({ exhausted: true });
      return;
    }
    // Retain an acquired lock if navigation fails, so retry opens the same item.
    pendingNext = next;
    dependencies.cacheItem(next);
    await enter(dependencies, [...history, locationFor(next)], history.length);
    pendingNext = undefined;
    store.setState({ exhausted: false });
  }

  async function transition(name: Transition, action: () => Promise<void>) {
    if (store.getState().isTransitioning) return;
    store.setState({ isTransitioning: true, error: null });
    try {
      await action();
    } catch {
      const { history, progressIndex, completedItemIds } = store.getState();
      const completed = completedItemIds.has(history[progressIndex]?.id);
      let message = "Could not open the queue item. Try again.";
      if (name === "complete")
        message = completed
          ? "Item completed, but the queue could not refresh. Try again to continue."
          : "Could not complete this item. Try again.";
      store.setState({
        error: {
          action: name,
          message,
        },
      });
    } finally {
      store.setState({ isTransitioning: false });
    }
  }

  const actions = {
    async start(dependencies: QueueRunDependencies, signal: AbortSignal) {
      if (!initialRequest) {
        initialRequest = initialItemId
          ? dependencies.loadItem(initialItemId)
          : dependencies.loadNext([]);
      }
      let item: QueueItem | null;
      try {
        item = await initialRequest;
      } catch (error) {
        initialRequest = undefined;
        throw error;
      }
      signal.throwIfAborted();
      if (item) {
        dependencies.cacheItem(item);
        await enter(dependencies, [locationFor(item)], 0, true);
      } else {
        store.setState({ exhausted: true });
      }
      return true;
    },
    next(dependencies: QueueRunDependencies) {
      return transition("next", () => advance(dependencies));
    },
    back(dependencies: QueueRunDependencies) {
      return transition("back", async () => {
        const { history, progressIndex } = store.getState();
        if (progressIndex > 0)
          await enter(dependencies, history, progressIndex - 1);
      });
    },
    complete(dependencies: QueueRunDependencies) {
      return transition("complete", async () => {
        const { history, progressIndex, completedItemIds } = store.getState();
        const item = history[progressIndex];
        if (!item) return;
        if (!completedItemIds.has(item.id)) {
          await dependencies.completeItem(item.id);
          store.setState({
            completedItemIds: new Set([...completedItemIds, item.id]),
          });
        }
        await dependencies.refreshItems();
        if (!singleItem) await advance(dependencies);
      });
    },
    retry(dependencies: QueueRunDependencies): Promise<void> {
      const action = store.getState().error?.action;
      return action ? actions[action](dependencies) : Promise.resolve();
    },
  };

  return { store, actions };
}

export type AnnotationQueueRun = ReturnType<typeof createAnnotationQueueRun>;
