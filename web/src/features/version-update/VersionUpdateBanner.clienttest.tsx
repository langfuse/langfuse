import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionUpdateBanner } from "./VersionUpdateBanner";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";
import {
  createVersionUpdateStore,
  VERSION_UPDATE_SHOW_THROTTLE_MS,
  VERSION_UPDATE_DISMISS_SUPPRESSION_MS,
  VERSION_UPDATE_LAST_SHOWN_AT_KEY,
  VERSION_UPDATE_SUPPRESSED_UNTIL_KEY,
  type VersionUpdateStore,
} from "./versionUpdateStore";
import type * as versionUpdateStoreModule from "./versionUpdateStore";

// Shared mutable mock state (hoisted above the vi.mock factories). When
// `h.store` is set, the mocked singleton + availability hook delegate to that
// REAL store instance (integration tests); otherwise the plain stubs apply.
const h = vi.hoisted(() => ({
  capture: vi.fn(),
  dismiss: vi.fn(),
  markShownReported: vi.fn(() => true),
  available: true,
  settled: true,
  store: null as VersionUpdateStore | null,
}));

// The connected banner portals into the top-most overlay layer, whose DOM
// container only exists via _document.tsx; render children inline for the test.
vi.mock("@/src/components/ui/layer", () => ({
  Layer: ({ children }: { children?: unknown }) => children,
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => h.capture,
}));
vi.mock("./versionUpdateStore", async (importOriginal) => {
  const actual = await importOriginal<typeof versionUpdateStoreModule>();
  return {
    ...actual,
    versionUpdateStore: {
      dismiss: () => (h.store ? h.store.dismiss() : h.dismiss()),
      markShownReported: () =>
        h.store ? h.store.markShownReported() : h.markShownReported(),
    },
  };
});
vi.mock("./useVersionUpdateAvailable", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribeNoop = () => () => {};
  return {
    useVersionUpdateAvailable: () =>
      useSyncExternalStore(
        h.store ? h.store.subscribe : subscribeNoop,
        h.store ? h.store.getSnapshot : () => h.available,
        () => false,
      ),
  };
});
vi.mock("./useAppSettled", () => ({
  useAppSettled: () => h.settled,
}));

describe("VersionUpdateBannerView", () => {
  it("renders a reload and a dismiss control", () => {
    render(
      <VersionUpdateBannerView onReload={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("invokes the callbacks when the controls are clicked", () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render(
      <VersionUpdateBannerView onReload={onReload} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("VersionUpdateBanner (connected)", () => {
  beforeEach(() => {
    h.capture.mockClear();
    h.dismiss.mockClear();
    h.markShownReported.mockClear();
    h.markShownReported.mockReturnValue(true);
    h.available = true;
    h.settled = true;
    h.store = null;
    // Reload is invoked on the Reload click; stub it so jsdom doesn't complain.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: vi.fn() },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows and reports banner_shown when an update is available and the app has settled", () => {
    render(<VersionUpdateBanner />);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(h.capture).toHaveBeenCalledWith("version_update:banner_shown");
    expect(
      h.capture.mock.calls.filter(
        (c) => c[0] === "version_update:banner_shown",
      ),
    ).toHaveLength(1);
  });

  it("delegates the once-per-appearance guard to the store (no banner_shown when it returns false)", () => {
    // Simulates a remount for an appearance the store already reported.
    h.markShownReported.mockReturnValue(false);
    render(<VersionUpdateBanner />);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(h.capture).not.toHaveBeenCalledWith("version_update:banner_shown");
  });

  it("stays hidden until the app has settled", () => {
    h.settled = false;
    render(<VersionUpdateBanner />);
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.markShownReported).not.toHaveBeenCalled();
  });

  it("renders nothing when no update is available", () => {
    h.available = false;
    render(<VersionUpdateBanner />);
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("captures reload_clicked and reloads on Reload", () => {
    render(<VersionUpdateBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(h.capture).toHaveBeenCalledWith("version_update:reload_clicked");
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("captures dismissed and calls the store on Dismiss", () => {
    render(<VersionUpdateBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(h.capture).toHaveBeenCalledWith("version_update:dismissed");
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });
});

// End-to-end through a REAL store (fake storage + injected clock): the
// persisted suppression windows (LFE-14765) must keep the banner — and its
// `banner_shown` analytics — quiet, and dismiss must persist its window.
describe("VersionUpdateBanner (integration: real store + fake storage)", () => {
  const createFakeStorage = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
  };

  beforeEach(() => {
    h.capture.mockClear();
    h.settled = true;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: vi.fn() },
    });
  });

  afterEach(() => {
    h.store = null;
    vi.restoreAllMocks();
  });

  it("stays hidden and fires no banner_shown while the show throttle is active; shows once it expires", () => {
    const storage = createFakeStorage();
    // A banner appearance was recorded just before this simulated reload.
    storage.setItem(VERSION_UPDATE_LAST_SHOWN_AT_KEY, "0");
    let now = 0;
    const store = createVersionUpdateStore(
      () => "running",
      0,
      () => now,
      () => storage,
    );
    h.store = store;

    render(<VersionUpdateBanner />);
    act(() => {
      now = 60 * 1000;
      store.reportObservedBuildId("deployed");
    });
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    expect(h.capture).not.toHaveBeenCalled();

    // Throttle expiry: the next observed response surfaces the pending update;
    // banner_shown fires once and the appearance re-arms the throttle.
    act(() => {
      now = VERSION_UPDATE_SHOW_THROTTLE_MS + 1;
      store.reportObservedBuildId("deployed");
    });
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(
      h.capture.mock.calls.filter(
        (c) => c[0] === "version_update:banner_shown",
      ),
    ).toHaveLength(1);
    expect(storage.getItem(VERSION_UPDATE_LAST_SHOWN_AT_KEY)).toBe(
      String(VERSION_UPDATE_SHOW_THROTTLE_MS + 1),
    );
  });

  it("persists the 24 h suppression window on dismiss and keeps new builds quiet", () => {
    const storage = createFakeStorage();
    let now = 1_000;
    const store = createVersionUpdateStore(
      () => "running",
      0,
      () => now,
      () => storage,
    );
    h.store = store;

    render(<VersionUpdateBanner />);
    act(() => {
      store.reportObservedBuildId("deployed");
    });
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(h.capture).toHaveBeenCalledWith("version_update:dismissed");
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    expect(storage.getItem(VERSION_UPDATE_SUPPRESSED_UNTIL_KEY)).toBe(
      String(1_000 + VERSION_UPDATE_DISMISS_SUPPRESSION_MS),
    );

    // A genuinely new build inside the window must not re-show the banner.
    act(() => {
      now = 2_000;
      store.reportObservedBuildId("deployed-2");
    });
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
  });
});
