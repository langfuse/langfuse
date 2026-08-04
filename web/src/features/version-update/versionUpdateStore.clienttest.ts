import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createVersionUpdateStore,
  isVersionMismatch,
  VERSION_UPDATE_DEBOUNCE_MS,
  VERSION_UPDATE_SHOW_THROTTLE_MS,
  VERSION_UPDATE_DISMISS_SUPPRESSION_MS,
  VERSION_UPDATE_LAST_SHOWN_AT_KEY,
  VERSION_UPDATE_SUPPRESSED_UNTIL_KEY,
} from "./versionUpdateStore";

// No persistence → the store's pure in-memory semantics. Used where the test
// pins behavior that persisted suppression (LFE-14765) would otherwise mask.
const noStorage = () => undefined;

// Minimal Map-backed Storage double — deterministic, shareable across store
// instances to simulate reloads and tabs.
const createFakeStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

describe("isVersionMismatch", () => {
  it("is true only when both ids are present and differ", () => {
    expect(isVersionMismatch("build-a", "build-b")).toBe(true);
  });

  it("is false when the ids are equal", () => {
    expect(isVersionMismatch("build-a", "build-a")).toBe(false);
  });

  it("is false when either id is missing", () => {
    // running missing
    expect(isVersionMismatch(null, "build-b")).toBe(false);
    expect(isVersionMismatch(undefined, "build-b")).toBe(false);
    expect(isVersionMismatch("", "build-b")).toBe(false);
    // observed missing
    expect(isVersionMismatch("build-a", null)).toBe(false);
    expect(isVersionMismatch("build-a", undefined)).toBe(false);
    expect(isVersionMismatch("build-a", "")).toBe(false);
    // both missing
    expect(isVersionMismatch(null, null)).toBe(false);
    expect(isVersionMismatch(undefined, undefined)).toBe(false);
  });
});

describe("versionUpdateStore", () => {
  beforeEach(() => {
    // Stores built without an injected accessor use the factory default —
    // jsdom's real localStorage — which is shared across tests; isolate them.
    window.localStorage.clear();
  });

  it("starts with no update available", () => {
    const store = createVersionUpdateStore(() => "running", 0);
    expect(store.getSnapshot()).toBe(false);
  });

  it("stays silent when the observed build matches the running build", () => {
    const store = createVersionUpdateStore(() => "running", 0);
    store.reportObservedBuildId("running");
    expect(store.getSnapshot()).toBe(false);
  });

  it("becomes available when a differing build id is observed", () => {
    const store = createVersionUpdateStore(() => "running", 0);
    store.reportObservedBuildId("deployed");
    expect(store.getSnapshot()).toBe(true);
  });

  it("stays silent when the running build id is unknown", () => {
    const store = createVersionUpdateStore(() => undefined, 0);
    store.reportObservedBuildId("deployed");
    expect(store.getSnapshot()).toBe(false);
  });

  it("ignores empty/absent observed build ids", () => {
    const store = createVersionUpdateStore(() => "running", 0);
    store.reportObservedBuildId(null);
    store.reportObservedBuildId(undefined);
    store.reportObservedBuildId("");
    expect(store.getSnapshot()).toBe(false);
  });

  // Pure in-memory dismiss semantics (`noStorage`) — with storage present the
  // persisted 24 h dismiss suppression additionally holds back the new build
  // (see "persisted suppression" below).
  it("hides after dismiss and re-shows only when a not-yet-seen build arrives (in-memory fallback)", () => {
    const store = createVersionUpdateStore(
      () => "running",
      0,
      undefined,
      noStorage,
    );

    store.reportObservedBuildId("deployed-1");
    expect(store.getSnapshot()).toBe(true);

    store.dismiss();
    expect(store.getSnapshot()).toBe(false);

    // The same build id must not re-trigger the banner after dismissal.
    store.reportObservedBuildId("deployed-1");
    expect(store.getSnapshot()).toBe(false);

    // A build id the user has not seen re-shows it.
    store.reportObservedBuildId("deployed-2");
    expect(store.getSnapshot()).toBe(true);
  });

  // Rolling deploy: one tab sees responses from BOTH old and new pods, in any
  // order, and build ids are opaque (no orderable newer/older). These guard the
  // three failure modes flagged in review.
  describe("rolling deploy robustness", () => {
    it("stays available once a differing build is seen — a later old-pod response cannot suppress it", () => {
      const store = createVersionUpdateStore(() => "running", 0);

      store.reportObservedBuildId("deployed"); // new pod
      expect(store.getSnapshot()).toBe(true);

      // Old pod still serving the running build id — must NOT clear the banner.
      store.reportObservedBuildId("running");
      expect(store.getSnapshot()).toBe(true);

      // Alternating pods likewise keep it sticky.
      store.reportObservedBuildId("deployed");
      store.reportObservedBuildId("running");
      expect(store.getSnapshot()).toBe(true);
    });

    it("does not reopen a dismissed banner when an already-seen build re-appears (old pod)", () => {
      // `noStorage` so the seen-set invariant is pinned on its own, not via
      // the persisted dismiss suppression.
      const store = createVersionUpdateStore(
        () => "running",
        0,
        undefined,
        noStorage,
      );

      store.reportObservedBuildId("deployed");
      store.dismiss();
      expect(store.getSnapshot()).toBe(false);

      // Old pods keep alternating: re-observing the running id or the
      // already-seen deployed id must not reopen the dismissed banner.
      store.reportObservedBuildId("running");
      store.reportObservedBuildId("deployed");
      expect(store.getSnapshot()).toBe(false);
    });

    it("re-observing an already-seen build never flaps the snapshot (no extra notifications)", () => {
      const store = createVersionUpdateStore(() => "running", 0);
      const listener = vi.fn();
      store.subscribe(listener);

      store.reportObservedBuildId("deployed"); // 1 change: false→true
      store.reportObservedBuildId("deployed"); // seen → no-op
      store.reportObservedBuildId("running"); // matches running → no-op
      store.reportObservedBuildId("deployed"); // seen → no-op
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot()).toBe(true);
    });
  });

  it("notifies subscribers when the snapshot changes and after unsubscribe stops", () => {
    // `noStorage` so the post-unsubscribe report really changes the snapshot
    // (a persisted dismiss suppression would keep it false and mask a broken
    // unsubscribe).
    const store = createVersionUpdateStore(
      () => "running",
      0,
      undefined,
      noStorage,
    );
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.reportObservedBuildId("deployed");
    expect(listener).toHaveBeenCalledTimes(1);

    // No snapshot change → no extra notification.
    store.reportObservedBuildId("deployed");
    expect(listener).toHaveBeenCalledTimes(1);

    store.dismiss();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.reportObservedBuildId("deployed-next");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("has a server snapshot that is always false", () => {
    const store = createVersionUpdateStore(() => "running", 0);
    store.reportObservedBuildId("deployed");
    expect(store.getServerSnapshot()).toBe(false);
  });

  // `banner_shown` fires once per appearance; the guard lives here (not in
  // component state) so a banner remount cannot double-count one appearance.
  describe("markShownReported (banner_shown once-per-appearance guard)", () => {
    it("returns true once per appearance, then false", () => {
      const store = createVersionUpdateStore(() => "running", 0);
      store.reportObservedBuildId("deployed");

      expect(store.markShownReported()).toBe(true);
      // A remount / StrictMode-double-invoked effect calls it again for the same
      // appearance — must not count twice.
      expect(store.markShownReported()).toBe(false);
      expect(store.markShownReported()).toBe(false);
    });

    it("resets for a genuinely new build id (a fresh appearance)", () => {
      const store = createVersionUpdateStore(() => "running", 0);

      store.reportObservedBuildId("deployed-1");
      expect(store.markShownReported()).toBe(true);
      expect(store.markShownReported()).toBe(false);

      // A new, never-seen build id is a new appearance → report again.
      store.reportObservedBuildId("deployed-2");
      expect(store.markShownReported()).toBe(true);
      expect(store.markShownReported()).toBe(false);
    });

    it("does not reset when an already-seen build id is re-observed", () => {
      const store = createVersionUpdateStore(() => "running", 0);

      store.reportObservedBuildId("deployed");
      expect(store.markShownReported()).toBe(true);

      // Re-observing the same (or the running) id is a no-op — no new appearance.
      store.reportObservedBuildId("deployed");
      store.reportObservedBuildId("running");
      expect(store.markShownReported()).toBe(false);
    });
  });

  // A page loaded mid-deploy sees the new build id immediately; prompting a
  // reload right then reloads into a still-switching pod (LFE-14537). The
  // snapshot must stay false until the settling window elapses.
  describe("new-version debounce (LFE-14537)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("stays hidden until the debounce elapses after the first new build id", () => {
      const store = createVersionUpdateStore(() => "running", 180_000);

      store.reportObservedBuildId("deployed");
      // Available, but within the settling window → still not shown.
      expect(store.getSnapshot()).toBe(false);

      vi.advanceTimersByTime(179_999);
      expect(store.getSnapshot()).toBe(false);

      vi.advanceTimersByTime(1);
      expect(store.getSnapshot()).toBe(true);
    });

    it("notifies subscribers exactly once, when the window elapses (not on detection)", () => {
      const store = createVersionUpdateStore(() => "running", 180_000);
      const listener = vi.fn();
      store.subscribe(listener);

      store.reportObservedBuildId("deployed");
      expect(listener).not.toHaveBeenCalled(); // hidden → snapshot unchanged

      vi.advanceTimersByTime(180_000);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot()).toBe(true);
    });

    it("keys the window to the FIRST sighting — a second new build within it does not extend the wait", () => {
      const store = createVersionUpdateStore(() => "running", 180_000);

      store.reportObservedBuildId("deployed-1");
      vi.advanceTimersByTime(100_000);
      // A second genuinely-new build mid-window must not re-arm the timer.
      store.reportObservedBuildId("deployed-2");
      vi.advanceTimersByTime(79_999);
      expect(store.getSnapshot()).toBe(false);

      vi.advanceTimersByTime(1); // 180_000 total since the first sighting
      expect(store.getSnapshot()).toBe(true);
    });

    it("re-prompts immediately for a new build once the window has already passed", () => {
      // `noStorage`: this pins the debounce being satisfied, without the
      // persisted 24 h dismiss suppression on top.
      const store = createVersionUpdateStore(
        () => "running",
        180_000,
        undefined,
        noStorage,
      );

      store.reportObservedBuildId("deployed-1");
      vi.advanceTimersByTime(180_000);
      expect(store.getSnapshot()).toBe(true);

      store.dismiss();
      expect(store.getSnapshot()).toBe(false);

      // The settling window is already satisfied → a later new build shows at once.
      store.reportObservedBuildId("deployed-2");
      expect(store.getSnapshot()).toBe(true);
    });

    it("arms no timer when only the running build id is observed", () => {
      const store = createVersionUpdateStore(() => "running", 180_000);

      store.reportObservedBuildId("running"); // matches → no new-version signal
      vi.advanceTimersByTime(180_000);
      expect(store.getSnapshot()).toBe(false);
    });

    it("defaults the debounce window to three minutes", () => {
      expect(VERSION_UPDATE_DEBOUNCE_MS).toBe(3 * 60 * 1000);

      const store = createVersionUpdateStore(() => "running");
      store.reportObservedBuildId("deployed");
      vi.advanceTimersByTime(VERSION_UPDATE_DEBOUNCE_MS - 1);
      expect(store.getSnapshot()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(store.getSnapshot()).toBe(true);
    });
  });

  // Back-to-back releases re-armed the banner on every deploy, and dismiss was
  // per-tab and per-build — a customer saw the banner after every reload
  // (LFE-14765). Two localStorage-persisted windows gate NEW appearances:
  // shown at most once per VERSION_UPDATE_SHOW_THROTTLE_MS, and an explicit
  // dismiss suppresses for VERSION_UPDATE_DISMISS_SUPPRESSION_MS.
  describe("persisted suppression (LFE-14765)", () => {
    it("records the last-shown timestamp when the banner actually shows", () => {
      const storage = createFakeStorage();
      const store = createVersionUpdateStore(
        () => "running",
        0,
        () => 1_000,
        () => storage,
      );

      store.reportObservedBuildId("deployed");
      expect(storage.getItem(VERSION_UPDATE_LAST_SHOWN_AT_KEY)).toBeNull();

      // The write happens on the actual appearance (markShownReported), not on
      // mere eligibility — a banner held back by `useAppSettled` records nothing.
      expect(store.markShownReported()).toBe(true);
      expect(storage.getItem(VERSION_UPDATE_LAST_SHOWN_AT_KEY)).toBe("1000");
    });

    it("throttles a second appearance within 2 h — across a reload (new store, same storage)", () => {
      const storage = createFakeStorage();
      let now = 0;

      // The banner shows for build-2 …
      const before = createVersionUpdateStore(
        () => "build-1",
        0,
        () => now,
        () => storage,
      );
      before.reportObservedBuildId("build-2");
      expect(before.getSnapshot()).toBe(true);
      expect(before.markShownReported()).toBe(true);

      // … the user reloads onto build-2, and another release lands 30 min later.
      now = 30 * 60 * 1000;
      const after = createVersionUpdateStore(
        () => "build-2",
        0,
        () => now,
        () => storage,
      );
      after.reportObservedBuildId("build-3");
      expect(after.getSnapshot()).toBe(false); // shown < 2 h ago → throttled

      // Expiry re-allows: a routine re-observation (every tRPC response) is the
      // clock tick that surfaces the pending update — no dedicated timer.
      now = VERSION_UPDATE_SHOW_THROTTLE_MS + 1;
      after.reportObservedBuildId("build-3");
      expect(after.getSnapshot()).toBe(true);
    });

    it("never hides a banner that is already visible (windows gate new appearances only)", () => {
      const storage = createFakeStorage();
      let now = 0;
      const store = createVersionUpdateStore(
        () => "running",
        0,
        () => now,
        () => storage,
      );

      store.reportObservedBuildId("deployed-1");
      expect(store.getSnapshot()).toBe(true);
      expect(store.markShownReported()).toBe(true); // throttle armed at t=0

      // Inside the throttle window, routine ticks and even a genuinely new
      // build must not hide (or blink) the banner already on screen.
      now = 60 * 1000;
      store.reportObservedBuildId("deployed-1");
      store.reportObservedBuildId("deployed-2");
      expect(store.getSnapshot()).toBe(true);
    });

    it("dismiss suppresses even genuinely new builds for 24 h — across a reload", () => {
      const storage = createFakeStorage();
      let now = 0;
      const store = createVersionUpdateStore(
        () => "running",
        0,
        () => now,
        () => storage,
      );

      store.reportObservedBuildId("deployed-1");
      store.dismiss();
      expect(storage.getItem(VERSION_UPDATE_SUPPRESSED_UNTIL_KEY)).toBe(
        String(VERSION_UPDATE_DISMISS_SUPPRESSION_MS),
      );

      // A genuinely new build inside the window stays quiet — unlike the
      // in-memory fallback, where it would re-prompt immediately.
      now = 3 * 60 * 60 * 1000; // past the show throttle, inside the dismiss window
      store.reportObservedBuildId("deployed-2");
      expect(store.getSnapshot()).toBe(false);

      // … and so does a reloaded tab (new store, same storage).
      const reloaded = createVersionUpdateStore(
        () => "running",
        0,
        () => now,
        () => storage,
      );
      reloaded.reportObservedBuildId("deployed-2");
      expect(reloaded.getSnapshot()).toBe(false);

      // Expiry re-allows: the pending update surfaces on the next response.
      now = VERSION_UPDATE_DISMISS_SUPPRESSION_MS + 1;
      store.reportObservedBuildId("deployed-2");
      expect(store.getSnapshot()).toBe(true);
    });

    it("falls back to in-memory behavior when storage methods throw", () => {
      const throwingStorage: Pick<Storage, "getItem" | "setItem"> = {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      };
      const store = createVersionUpdateStore(
        () => "running",
        0,
        () => 0,
        () => throwingStorage,
      );

      store.reportObservedBuildId("deployed-1");
      expect(store.getSnapshot()).toBe(true); // read errors don't block showing
      expect(store.markShownReported()).toBe(true); // write error swallowed

      store.dismiss(); // write error swallowed; in-memory dismiss still works
      expect(store.getSnapshot()).toBe(false);

      // In-memory semantics: a genuinely new build re-prompts immediately.
      store.reportObservedBuildId("deployed-2");
      expect(store.getSnapshot()).toBe(true);
    });

    it("treats a throwing storage accessor and garbage values as absent", () => {
      const accessorThrows = createVersionUpdateStore(
        () => "running",
        0,
        () => 0,
        () => {
          throw new Error("no storage");
        },
      );
      accessorThrows.reportObservedBuildId("deployed");
      expect(accessorThrows.getSnapshot()).toBe(true);
      expect(accessorThrows.markShownReported()).toBe(true);

      const storage = createFakeStorage();
      storage.setItem(VERSION_UPDATE_LAST_SHOWN_AT_KEY, "not-a-number");
      storage.setItem(VERSION_UPDATE_SUPPRESSED_UNTIL_KEY, "NaN");
      const garbage = createVersionUpdateStore(
        () => "running",
        0,
        () => 0,
        () => storage,
      );
      garbage.reportObservedBuildId("deployed");
      expect(garbage.getSnapshot()).toBe(true);
    });

    // Clock skew: a timestamp persisted before the wall clock moved backward
    // (correction, restored VM) is finite — the garbage-value guard passes it —
    // but future-dated. Honoring it would suppress until the clock catches up.
    it("ignores a future-dated last-shown timestamp (clock moved backward)", () => {
      const storage = createFakeStorage();
      storage.setItem(
        VERSION_UPDATE_LAST_SHOWN_AT_KEY,
        String(5 * 60 * 60 * 1000), // "shown" five hours in the future
      );
      const store = createVersionUpdateStore(
        () => "running",
        0,
        () => 1_000,
        () => storage,
      );
      store.reportObservedBuildId("deployed");
      expect(store.getSnapshot()).toBe(true);
    });

    it("ignores a suppressed-until further than one dismiss window ahead", () => {
      const bogus = createFakeStorage();
      bogus.setItem(
        VERSION_UPDATE_SUPPRESSED_UNTIL_KEY,
        String(1_000 + VERSION_UPDATE_DISMISS_SUPPRESSION_MS + 1),
      );
      const store = createVersionUpdateStore(
        () => "running",
        0,
        () => 1_000,
        () => bogus,
      );
      store.reportObservedBuildId("deployed");
      expect(store.getSnapshot()).toBe(true);

      // Exactly one window ahead is what a fresh dismiss writes — still honored.
      const valid = createFakeStorage();
      valid.setItem(
        VERSION_UPDATE_SUPPRESSED_UNTIL_KEY,
        String(1_000 + VERSION_UPDATE_DISMISS_SUPPRESSION_MS),
      );
      const suppressed = createVersionUpdateStore(
        () => "running",
        0,
        () => 1_000,
        () => valid,
      );
      suppressed.reportObservedBuildId("deployed");
      expect(suppressed.getSnapshot()).toBe(false);
    });
  });
});
