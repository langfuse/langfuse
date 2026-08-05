import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionUpdateBanner } from "./VersionUpdateBanner";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";
import {
  createVersionUpdateStore,
  VERSION_UPDATE_MIN_STALENESS_MS,
  VERSION_UPDATE_DISMISS_SUPPRESSION_MS,
  VERSION_UPDATE_SUPPRESSED_UNTIL_KEY,
  type VersionUpdateStore,
} from "./versionUpdateStore";
import type * as versionUpdateStoreModule from "./versionUpdateStore";

// Hoisted mock state. With `h.store` set, the mocked singleton and the
// availability hook delegate to that REAL store (integration tests); otherwise
// the plain stubs apply.
const h = vi.hoisted(() => ({
  capture: vi.fn(),
  dismiss: vi.fn(),
  markShownReported: vi.fn(() => true),
  available: true,
  settled: true,
  store: null as VersionUpdateStore | null,
}));

// The banner portals into an overlay layer that only exists via _document.tsx.
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
  h.dismiss.mockClear();
  h.markShownReported.mockClear();
  h.markShownReported.mockReturnValue(true);
  h.available = true;
  h.settled = true;
  h.store = null;
  // Reload is invoked on the Reload click; stub it for jsdom.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { reload: vi.fn() },
  });
});

afterEach(() => {
  h.store = null;
  vi.restoreAllMocks();
});

it("VersionUpdateBannerView renders both controls and invokes their callbacks", () => {
  const onReload = vi.fn();
  const onDismiss = vi.fn();
  render(<VersionUpdateBannerView onReload={onReload} onDismiss={onDismiss} />);

  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(onReload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

describe("VersionUpdateBanner (connected)", () => {
  it("shows and reports banner_shown exactly once when available and settled", () => {
    render(<VersionUpdateBanner />);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(
      h.capture.mock.calls.filter(
        (c) => c[0] === "version_update:banner_shown",
      ),
    ).toHaveLength(1);
  });

  it("renders nothing (and captures nothing) while unsettled or without an update", () => {
    h.settled = false;
    const unsettled = render(<VersionUpdateBanner />);
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    unsettled.unmount();

    h.settled = true;
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
});

describe("VersionUpdateBanner (integration: real store + fake storage)", () => {
  it("renders nothing and fires no banner_shown until the frontend is 48 h stale", () => {
    const storage = createFakeStorage();
    let now = 0;
    const store = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
    h.store = store;

    render(<VersionUpdateBanner />);
    act(() => {
      store.reportObservedBuildId("deployed");
    });
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    expect(h.capture).not.toHaveBeenCalled();

    // 48 h later the next response surfaces it; banner_shown fires once.
    act(() => {
      now = VERSION_UPDATE_MIN_STALENESS_MS;
      store.reportObservedBuildId("deployed");
    });
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(
      h.capture.mock.calls.filter(
        (c) => c[0] === "version_update:banner_shown",
      ),
    ).toHaveLength(1);
  });

  it("dismiss captures, hides, persists the 24 h window, and keeps new builds quiet", () => {
    const storage = createFakeStorage();
    let now = 1_000;
    const store = createVersionUpdateStore(() => "running", {
      debounceMs: 0,
      minStalenessMs: 0,
      now: () => now,
      getStorage: () => storage,
    });
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

    act(() => {
      now = 2_000;
      store.reportObservedBuildId("deployed-2"); // genuinely new — still quiet
    });
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
  });
});
