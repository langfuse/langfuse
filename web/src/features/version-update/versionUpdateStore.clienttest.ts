import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createVersionUpdateStore,
  isVersionMismatch,
  VERSION_UPDATE_MIN_STALENESS_MS,
  VERSION_UPDATE_SHOW_THROTTLE_MS,
  VERSION_UPDATE_DISMISS_SUPPRESSION_MS,
  VERSION_UPDATE_LAST_SHOWN_AT_KEY,
  VERSION_UPDATE_SUPPRESSED_UNTIL_KEY,
  VERSION_UPDATE_STALE_SINCE_KEY,
} from "./versionUpdateStore";

const noStorage = () => undefined;

// Map-backed Storage double, shareable across stores to simulate reloads/tabs.
const createFakeStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

it("isVersionMismatch is true only when both ids are present and differ", () => {
  expect(isVersionMismatch("build-a", "build-b")).toBe(true);
  expect(isVersionMismatch("build-a", "build-a")).toBe(false);
  expect(isVersionMismatch(null, "build-b")).toBe(false);
  expect(isVersionMismatch(undefined, "build-b")).toBe(false);
  expect(isVersionMismatch("", "build-b")).toBe(false);
  expect(isVersionMismatch("build-a", null)).toBe(false);
  expect(isVersionMismatch("build-a", "")).toBe(false);
  expect(isVersionMismatch(null, null)).toBe(false);
});

describe("versionUpdateStore", () => {
  // Mechanics tests disable the staleness gate and storage so each pins one behavior.
  const mechanics = { debounceMs: 0, minStalenessMs: 0, getStorage: noStorage };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("arms only on a real mismatch", () => {
    const store = createVersionUpdateStore(() => "running", mechanics);
    expect(store.getSnapshot()).toBe(false);
    store.reportObservedBuildId("running");
    store.reportObservedBuildId(null);
    store.reportObservedBuildId("");
    expect(store.getSnapshot()).toBe(false);
    store.reportObservedBuildId("deployed");
    expect(store.getSnapshot()).toBe(true);

    // Unknown running build (self-hosted without a build id) proves nothing.
    const unknown = createVersionUpdateStore(() => undefined, mechanics);
    unknown.reportObservedBuildId("deployed");
    expect(unknown.getSnapshot()).toBe(false);
  });

  it("is sticky and flap-free while rolling-deploy pods serve mixed responses", () => {
    const store = createVersionUpdateStore(() => "running", mechanics);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.reportObservedBuildId("deployed"); // false→true
    store.reportObservedBuildId("running"); // old pod — cannot clear it
    store.reportObservedBuildId("deployed"); // re-observation — no flap
    expect(store.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getServerSnapshot()).toBe(false);

    unsubscribe();
    store.dismiss();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dismiss hides the visible banner; only a never-seen build re-shows (in-memory)", () => {
    const store = createVersionUpdateStore(() => "running", mechanics);
    store.reportObservedBuildId("deployed-1");
    expect(store.getSnapshot()).toBe(true);
    store.dismiss();
    expect(store.getSnapshot()).toBe(false);
    store.reportObservedBuildId("deployed-1"); // already seen
    expect(store.getSnapshot()).toBe(false);
    store.reportObservedBuildId("deployed-2"); // genuinely new
    expect(store.getSnapshot()).toBe(true);
  });

  it("markShownReported is true once per appearance and re-arms on a new build", () => {
    const store = createVersionUpdateStore(() => "running", mechanics);
    store.reportObservedBuildId("deployed-1");
    expect(store.markShownReported()).toBe(true);
    expect(store.markShownReported()).toBe(false); // remount/StrictMode replay
    store.reportObservedBuildId("deployed-1"); // re-observation — no reset
    expect(store.markShownReported()).toBe(false);
    store.reportObservedBuildId("deployed-2"); // fresh appearance
    expect(store.markShownReported()).toBe(true);
  });

  it("debounces from the FIRST sighting; a second new build does not extend the wait", () => {
    vi.useFakeTimers();
    const store = createVersionUpdateStore(() => "running", {
      debounceMs: 180_000,
      minStalenessMs: 0,
      getStorage: noStorage,
    });
    store.reportObservedBuildId("deployed-1");
    vi.advanceTimersByTime(100_000);
    store.reportObservedBuildId("deployed-2");
    vi.advanceTimersByTime(79_999);
    expect(store.getSnapshot()).toBe(false);
    vi.advanceTimersByTime(1); // 180_000 since the first sighting
    expect(store.getSnapshot()).toBe(true);
  });

  it("shows only once the running build has been superseded for 48 h", () => {
    const storage = createFakeStorage();
    let now = 0;
    const store = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    store.reportObservedBuildId("deployed");
    expect(store.getSnapshot()).toBe(false); // superseded, but not stale yet
    now = VERSION_UPDATE_MIN_STALENESS_MS - 1;
    store.reportObservedBuildId("deployed");
    expect(store.getSnapshot()).toBe(false);
    now = VERSION_UPDATE_MIN_STALENESS_MS;
    store.reportObservedBuildId("deployed"); // responses are the clock ticks
    expect(store.getSnapshot()).toBe(true);
  });

  it("keeps stale-since across a reload of the SAME running build", () => {
    const storage = createFakeStorage();
    let now = 0;
    createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      now: () => now,
      getStorage: () => storage,
    }).reportObservedBuildId("deployed"); // stale-since recorded at t=0

    now = VERSION_UPDATE_MIN_STALENESS_MS;
    const reloaded = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    reloaded.reportObservedBuildId("deployed");
    expect(reloaded.getSnapshot()).toBe(true); // 48 h since the FIRST sighting
  });

  it("restarts stale-since when the tab reloads onto a NEW running build", () => {
    const storage = createFakeStorage();
    let now = 0;
    createVersionUpdateStore(() => "build-1", {
      debounceMs: 0,
      now: () => now,
      getStorage: () => storage,
    }).reportObservedBuildId("build-2"); // { buildId: build-1, ts: 0 }

    now = VERSION_UPDATE_MIN_STALENESS_MS;
    const after = createVersionUpdateStore(() => "build-2", {
      debounceMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    after.reportObservedBuildId("build-3");
    expect(after.getSnapshot()).toBe(false); // clock restarted for build-2
    expect(storage.getItem(VERSION_UPDATE_STALE_SINCE_KEY)).toBe(
      JSON.stringify({ buildId: "build-2", ts: now }),
    );
    now = 2 * VERSION_UPDATE_MIN_STALENESS_MS;
    after.reportObservedBuildId("build-3");
    expect(after.getSnapshot()).toBe(true);
  });

  it("throttles a second appearance within 2 h across a reload; never hides a visible banner", () => {
    const storage = createFakeStorage();
    let now = 0;
    const before = createVersionUpdateStore(() => "build-1", {
      debounceMs: 0,
      minStalenessMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    before.reportObservedBuildId("build-2");
    expect(before.markShownReported()).toBe(true); // actual appearance …
    expect(storage.getItem(VERSION_UPDATE_LAST_SHOWN_AT_KEY)).toBe("0"); // … recorded

    // The windows gate new appearances only — a new build must not hide it.
    before.reportObservedBuildId("build-2b");
    expect(before.getSnapshot()).toBe(true);

    // Reload onto build-2; another release lands 30 min later → throttled.
    now = 30 * 60 * 1000;
    const after = createVersionUpdateStore(() => "build-2", {
      debounceMs: 0,
      minStalenessMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    after.reportObservedBuildId("build-3");
    expect(after.getSnapshot()).toBe(false);

    now = VERSION_UPDATE_SHOW_THROTTLE_MS + 1; // expiry re-allows
    after.reportObservedBuildId("build-3");
    expect(after.getSnapshot()).toBe(true);
  });

  it("dismiss suppresses even genuinely new builds for 24 h, across reloads", () => {
    const storage = createFakeStorage();
    let now = 0;
    const store = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      minStalenessMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    store.reportObservedBuildId("deployed-1");
    store.dismiss();
    expect(storage.getItem(VERSION_UPDATE_SUPPRESSED_UNTIL_KEY)).toBe(
      String(VERSION_UPDATE_DISMISS_SUPPRESSION_MS),
    );

    now = 3 * 60 * 60 * 1000; // inside the window: even a new build stays quiet
    store.reportObservedBuildId("deployed-2");
    expect(store.getSnapshot()).toBe(false);

    const reloaded = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      minStalenessMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    reloaded.reportObservedBuildId("deployed-2");
    expect(reloaded.getSnapshot()).toBe(false);

    now = VERSION_UPDATE_DISMISS_SUPPRESSION_MS + 1; // expiry re-allows
    store.reportObservedBuildId("deployed-2");
    expect(store.getSnapshot()).toBe(true);
  });

  it("degrades to in-memory behavior on throwing storage; future-dated stamps are ignored", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const store = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      minStalenessMs: 0,
      now: () => 0,
      getStorage: () => throwing,
    });
    store.reportObservedBuildId("deployed-1");
    expect(store.getSnapshot()).toBe(true); // read errors don't block showing
    expect(store.markShownReported()).toBe(true); // write error swallowed
    store.dismiss();
    expect(store.getSnapshot()).toBe(false);
    store.reportObservedBuildId("deployed-2"); // in-memory: new build re-prompts
    expect(store.getSnapshot()).toBe(true);

    // Clock skew: a last-shown-at ahead of now must be ignored, not clamped —
    // a clamp floats with now and would suppress until the clock caught up.
    const skewed = createFakeStorage();
    skewed.setItem(
      VERSION_UPDATE_LAST_SHOWN_AT_KEY,
      String(5 * 60 * 60 * 1000),
    );
    const skewStore = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      minStalenessMs: 0,
      now: () => 1_000,
      getStorage: () => skewed,
    });
    skewStore.reportObservedBuildId("deployed");
    expect(skewStore.getSnapshot()).toBe(true);
  });
});
