import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { useHistoryEntryRevisit } from "./useHistoryEntryRevisit";

// LFE-10715: the session page auto-applies a default view when the URL has no
// viewId. That must only happen on a fresh arrival — when the user reaches the
// param-less URL via Back/Forward (a history entry they already left once),
// "no view" is a recorded state and re-applying the default would overwrite
// it. The hook detects such revisits via the Next.js Pages Router per-entry
// `key` in window.history.state.

const mockRouter = { asPath: "/project/p1/sessions/s1" };

vi.mock("next/router", () => ({
  useRouter: () => mockRouter,
}));

const setHistoryEntry = (key: string | null) => {
  window.history.replaceState(key === null ? null : { key, __N: true }, "");
};

describe("useHistoryEntryRevisit (LFE-10715)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setHistoryEntry(null);
    mockRouter.asPath = "/project/p1/sessions/s1";
  });

  it("treats the first arrival at a history entry as fresh", () => {
    setHistoryEntry("entry-1");

    const { result } = renderHook(() => useHistoryEntryRevisit("session-1"));

    expect(result.current).toBe(false);
  });

  it("treats a return to an entry that was left as a revisit", () => {
    setHistoryEntry("entry-1");
    const { unmount } = renderHook(() => useHistoryEntryRevisit("session-1"));
    // Leaving the page (unmount) records the entry as visited.
    unmount();

    // Back: the same history entry (same key) is active again on a new mount.
    const { result } = renderHook(() => useHistoryEntryRevisit("session-1"));

    expect(result.current).toBe(true);
  });

  it("records entries left via in-page navigation, not just unmount", () => {
    setHistoryEntry("entry-1");
    const { rerender, unmount } = renderHook(
      () => useHistoryEntryRevisit("session-1"),
      { initialProps: {} },
    );

    // An in-page push (e.g. a filter edit) moves to a new entry; the old one
    // must be recorded as visited even though the component stays mounted.
    setHistoryEntry("entry-2");
    mockRouter.asPath = "/project/p1/sessions/s1?filter=x";
    rerender({});
    unmount();

    // Back onto the first entry after a remount.
    setHistoryEntry("entry-1");
    mockRouter.asPath = "/project/p1/sessions/s1";
    const { result } = renderHook(() => useHistoryEntryRevisit("session-1"));

    expect(result.current).toBe(true);
  });

  it("keeps the arrival decision stable for the lifetime of the mount", () => {
    setHistoryEntry("entry-1");
    const { result, rerender } = renderHook(
      () => useHistoryEntryRevisit("session-1"),
      { initialProps: {} },
    );
    expect(result.current).toBe(false);

    // A same-mount pop back onto an already-visited entry does not flip the
    // arrival decision — same-mount navigation is the caller's concern.
    setHistoryEntry("entry-2");
    mockRouter.asPath = "/project/p1/sessions/s1?filter=x";
    rerender({});
    setHistoryEntry("entry-1");
    mockRouter.asPath = "/project/p1/sessions/s1";
    rerender({});

    expect(result.current).toBe(false);
  });

  it("recomputes the decision when the scope key changes", () => {
    setHistoryEntry("entry-1");
    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useHistoryEntryRevisit(scope),
      { initialProps: { scope: "session-1" } },
    );
    expect(result.current).toBe(false);

    // Navigate to another session (push, new entry) — fresh for that scope.
    setHistoryEntry("entry-2");
    mockRouter.asPath = "/project/p1/sessions/s2";
    rerender({ scope: "session-2" });
    expect(result.current).toBe(false);

    // Pop back to the first session's entry with a scope change: the entry
    // was left, so the new scope's arrival is a revisit.
    setHistoryEntry("entry-1");
    mockRouter.asPath = "/project/p1/sessions/s1";
    rerender({ scope: "session-1" });
    expect(result.current).toBe(true);
  });

  it("does not flag a fresh arrival as revisit under StrictMode double-mounting", () => {
    setHistoryEntry("entry-1");

    const { result } = renderHook(() => useHistoryEntryRevisit("session-1"), {
      wrapper: StrictMode,
    });

    expect(result.current).toBe(false);
  });

  it("degrades to fresh when the history entry has no key", () => {
    setHistoryEntry(null);

    const { result, unmount } = renderHook(() =>
      useHistoryEntryRevisit("session-1"),
    );

    expect(result.current).toBe(false);
    expect(() => unmount()).not.toThrow();
  });
});
