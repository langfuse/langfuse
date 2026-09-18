import { createStore } from "zustand/vanilla";
import { type RouterOutput } from "@/src/utils/types";

type QueueItem = NonNullable<RouterOutput["annotationQueueItems"]["byId"]>;

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
  const store = createStore<{
    history: QueueItemLocation[];
    progressIndex: number;
    isTransitioning: boolean;
    exhausted: boolean;
  }>(() => ({
    history: [],
    progressIndex: 0,
    isTransitioning: false,
    exhausted: false,
  }));

  async function enter(
    dependencies: QueueRunDependencies,
    history: QueueItemLocation[],
    progressIndex: number,
    initialize = false,
  ) {
    if (!dependencies.isActive()) return;
    await dependencies.navigate(history[progressIndex], initialize);
    store.setState({ history, progressIndex });
  }

  async function advance(dependencies: QueueRunDependencies) {
    if (!dependencies.isActive()) return;
    const { history, progressIndex } = store.getState();
    if (progressIndex + 1 < history.length) {
      await enter(dependencies, history, progressIndex + 1);
      return;
    }
    const next = await dependencies.loadNext(history.map((item) => item.id));
    if (!next) {
      store.setState({ exhausted: true });
      return;
    }
    dependencies.cacheItem(next);
    await enter(dependencies, [...history, locationFor(next)], history.length);
    store.setState({ exhausted: false });
  }

  async function transition(action: () => Promise<void>) {
    if (store.getState().isTransitioning) return;
    store.setState({ isTransitioning: true });
    try {
      await action();
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
      return transition(() => advance(dependencies));
    },
    back(dependencies: QueueRunDependencies) {
      return transition(async () => {
        const { history, progressIndex } = store.getState();
        if (progressIndex > 0)
          await enter(dependencies, history, progressIndex - 1);
      });
    },
    complete(dependencies: QueueRunDependencies) {
      return transition(async () => {
        const { history, progressIndex } = store.getState();
        const item = history[progressIndex];
        if (!item) return;
        await dependencies.completeItem(item.id);
        await dependencies.refreshItems();
        if (!singleItem) await advance(dependencies);
      });
    },
  };

  return { store, actions };
}

export type AnnotationQueueRun = ReturnType<typeof createAnnotationQueueRun>;
