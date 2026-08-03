import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionUpdateBanner } from "./VersionUpdateBanner";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

// Shared mutable mock state (hoisted above the vi.mock factories).
const h = vi.hoisted(() => ({
  capture: vi.fn(),
  dismiss: vi.fn(),
  markShownReported: vi.fn(() => true),
  available: true,
  settled: true,
}));

// The connected banner portals into the top-most overlay layer, whose DOM
// container only exists via _document.tsx; render children inline for the test.
vi.mock("@/src/components/ui/layer", () => ({
  Layer: ({ children }: { children?: unknown }) => children,
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => h.capture,
}));
vi.mock("./versionUpdateStore", () => ({
  versionUpdateStore: {
    dismiss: h.dismiss,
    markShownReported: h.markShownReported,
  },
}));
vi.mock("./useVersionUpdateAvailable", () => ({
  useVersionUpdateAvailable: () => h.available,
}));
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
