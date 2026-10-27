import { createPageContextStore } from "@/src/features/page-context/pageContextStore";
import type {
  PageContextSnapshot,
  PageContextSurface,
} from "@/src/features/page-context/types";

function snapshot(
  title: string,
  surface: PageContextSurface = "page",
): PageContextSnapshot {
  return {
    version: 1,
    kind: "trace",
    label: "Trace",
    title,
    facts: [],
    surface,
    path: `/project/p/traces/${title}`,
  };
}

describe("createPageContextStore", () => {
  it("has no active context until something publishes", () => {
    expect(createPageContextStore().getActive()).toBeNull();
  });

  it("prefers a peek over the page underneath it, regardless of mount order", () => {
    const store = createPageContextStore();
    const peek = snapshot("peeked", "peek");
    const page = snapshot("list", "page");

    store.publish("peek", peek);
    store.publish("page", page);

    expect(store.getActive()).toBe(peek);
  });

  it("prefers the most recently mounted publisher on the same surface", () => {
    const store = createPageContextStore();
    store.publish("first", snapshot("first"));
    const second = snapshot("second");
    store.publish("second", second);

    expect(store.getActive()).toBe(second);
  });

  it("keeps a publisher's mount order when it updates its snapshot", () => {
    const store = createPageContextStore();
    store.publish("first", snapshot("first"));
    const second = snapshot("second");
    store.publish("second", second);

    store.publish("first", snapshot("first, updated"));

    expect(store.getActive()).toBe(second);
  });

  it("falls back to the remaining publisher when the active one retracts", () => {
    const store = createPageContextStore();
    const page = snapshot("page");
    store.publish("page", page);
    store.publish("peek", snapshot("peek", "peek"));

    store.retract("peek");

    expect(store.getActive()).toBe(page);
  });

  it("notifies subscribers only when the active snapshot changes", () => {
    const store = createPageContextStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const peek = snapshot("peek", "peek");

    store.publish("peek", peek);
    store.publish("page", snapshot("page"));
    store.publish("peek", peek);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createPageContextStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.publish("page", snapshot("page"));

    expect(listener).not.toHaveBeenCalled();
  });
});
