import { describe, expect, it } from "vitest";
import { createSessionDetailStore } from "@/src/components/session/sessionDetailStore";

describe("createSessionDetailStore", () => {
  it("marks loaded traces idempotently", () => {
    const store = createSessionDetailStore({
      initialSessionId: "session-a",
      initialShowCorrections: false,
    });

    store.getState().actions.markTraceLoaded("trace-1");
    const firstLoadedTraceIds = store.getState().loadedTraceIds;

    store.getState().actions.markTraceLoaded("trace-1");

    expect(store.getState().loadedTraceIds).toBe(firstLoadedTraceIds);
    expect(store.getState().loadedTraceIds).toEqual({ "trace-1": true });
  });

  it("resets loaded row state when the session changes", () => {
    const store = createSessionDetailStore({
      initialSessionId: "session-a",
      initialShowCorrections: false,
    });

    store.getState().actions.markTraceLoaded("trace-1");
    store.getState().actions.resetForSession("session-b");

    expect(store.getState().sessionId).toBe("session-b");
    expect(store.getState().loadedTraceIds).toEqual({});
  });

  it("updates correction visibility without changing loaded rows", () => {
    const store = createSessionDetailStore({
      initialSessionId: "session-a",
      initialShowCorrections: false,
    });

    store.getState().actions.markTraceLoaded("trace-1");
    const loadedTraceIds = store.getState().loadedTraceIds;

    store.getState().actions.setShowCorrections(true);

    expect(store.getState().showCorrections).toBe(true);
    expect(store.getState().loadedTraceIds).toBe(loadedTraceIds);
  });
});
