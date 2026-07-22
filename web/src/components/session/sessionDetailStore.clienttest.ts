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

  it("keeps the inline-tool preference independent from loaded rows", () => {
    const store = createSessionDetailStore({
      initialSessionId: "session-a",
      initialShowCorrections: false,
    });

    store.getState().actions.markTraceLoaded("trace-1");
    const loadedTraceIds = store.getState().loadedTraceIds;

    store.getState().actions.setShowInlineToolCalls(true);

    expect(store.getState()).toMatchObject({
      showInlineToolCalls: true,
    });
    expect(store.getState().loadedTraceIds).toBe(loadedTraceIds);
  });

  it("keeps system prompts independent from inline tool calls", () => {
    const store = createSessionDetailStore({
      initialSessionId: "session-a",
      initialShowCorrections: false,
    });

    store.getState().actions.setShowSystemPrompt(true);

    expect(store.getState()).toMatchObject({
      showInlineToolCalls: false,
      showSystemPrompt: true,
    });
  });

  it("defaults optional conversation content to hidden when the session changes", () => {
    const store = createSessionDetailStore({
      initialSessionId: "session-a",
      initialShowCorrections: false,
    });

    store.getState().actions.setShowInlineToolCalls(true);
    store.getState().actions.setShowSystemPrompt(true);
    store.getState().actions.resetForSession("session-b");

    expect(store.getState()).toMatchObject({
      sessionId: "session-b",
      showInlineToolCalls: false,
      showSystemPrompt: false,
    });
  });
});
