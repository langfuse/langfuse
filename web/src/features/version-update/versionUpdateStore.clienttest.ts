import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createVersionUpdateStore,
  isVersionMismatch,
  VERSION_UPDATE_DEBOUNCE_MS,
} from "./versionUpdateStore";

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

  it("hides after dismiss and re-shows only when a not-yet-seen build arrives", () => {
    const store = createVersionUpdateStore(() => "running", 0);

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
      const store = createVersionUpdateStore(() => "running", 0);

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
    const store = createVersionUpdateStore(() => "running", 0);
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
      const store = createVersionUpdateStore(() => "running", 180_000);

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
});
