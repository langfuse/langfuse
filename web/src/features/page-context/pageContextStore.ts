import type {
  PageContextSnapshot,
  PageContextSurface,
} from "@/src/features/page-context/types";

type PublishedPageContext = {
  snapshot: PageContextSnapshot;
  /** Insertion order of the publisher, kept across updates of the same id. */
  order: number;
};

const SURFACE_PRIORITY: Record<PageContextSurface, number> = {
  page: 0,
  // A peek is opened on top of a page, so it is what the user is looking at.
  peek: 1,
};

export type PageContextStore = {
  publish: (publisherId: string, snapshot: PageContextSnapshot) => void;
  retract: (publisherId: string) => void;
  /** The snapshot of the surface the user is currently looking at. */
  getActive: () => PageContextSnapshot | null;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Pages publish what they show; the assistant reads the active snapshot when
 * it opens. Several publishers can be mounted at once (a list page and the
 * peek on top of it), so the most specific surface wins, and among equals the
 * one mounted last.
 */
export function createPageContextStore(): PageContextStore {
  const published = new Map<string, PublishedPageContext>();
  const listeners = new Set<() => void>();
  let nextOrder = 0;
  let active: PageContextSnapshot | null = null;

  const resolveActive = () => {
    let winner: PublishedPageContext | null = null;
    for (const entry of published.values()) {
      if (
        !winner ||
        SURFACE_PRIORITY[entry.snapshot.surface] >
          SURFACE_PRIORITY[winner.snapshot.surface] ||
        (SURFACE_PRIORITY[entry.snapshot.surface] ===
          SURFACE_PRIORITY[winner.snapshot.surface] &&
          entry.order > winner.order)
      ) {
        winner = entry;
      }
    }
    return winner?.snapshot ?? null;
  };

  const commit = () => {
    const nextActive = resolveActive();
    if (nextActive === active) {
      return;
    }
    active = nextActive;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    publish(publisherId, snapshot) {
      const existing = published.get(publisherId);
      if (existing?.snapshot === snapshot) {
        return;
      }
      published.set(publisherId, {
        snapshot,
        order: existing?.order ?? nextOrder++,
      });
      commit();
    },
    retract(publisherId) {
      if (published.delete(publisherId)) {
        commit();
      }
    },
    getActive() {
      return active;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
