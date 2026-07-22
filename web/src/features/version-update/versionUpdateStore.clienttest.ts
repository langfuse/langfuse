import { describe, it, expect, vi } from "vitest";
import {
  createVersionUpdateStore,
  isVersionMismatch,
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
    const store = createVersionUpdateStore(() => "running");
    expect(store.getSnapshot()).toBe(false);
  });

  it("stays silent when the observed build matches the running build", () => {
    const store = createVersionUpdateStore(() => "running");
    store.reportObservedBuildId("running");
    expect(store.getSnapshot()).toBe(false);
  });

  it("becomes available when a differing build id is observed", () => {
    const store = createVersionUpdateStore(() => "running");
    store.reportObservedBuildId("deployed");
    expect(store.getSnapshot()).toBe(true);
  });

  it("stays silent when the running build id is unknown", () => {
    const store = createVersionUpdateStore(() => undefined);
    store.reportObservedBuildId("deployed");
    expect(store.getSnapshot()).toBe(false);
  });

  it("ignores empty/absent observed build ids", () => {
    const store = createVersionUpdateStore(() => "running");
    store.reportObservedBuildId(null);
    store.reportObservedBuildId(undefined);
    store.reportObservedBuildId("");
    expect(store.getSnapshot()).toBe(false);
  });

  it("hides after dismiss and re-shows only when a not-yet-seen build arrives", () => {
    const store = createVersionUpdateStore(() => "running");

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
      const store = createVersionUpdateStore(() => "running");

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
      const store = createVersionUpdateStore(() => "running");

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
      const store = createVersionUpdateStore(() => "running");
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
    const store = createVersionUpdateStore(() => "running");
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
    const store = createVersionUpdateStore(() => "running");
    store.reportObservedBuildId("deployed");
    expect(store.getServerSnapshot()).toBe(false);
  });
});
