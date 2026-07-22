import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionUpdateBanner } from "./VersionUpdateBanner";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

// Shared mutable mock state (hoisted above the vi.mock factories).
const h = vi.hoisted(() => ({
  capture: vi.fn(),
  dismiss: vi.fn(),
  visible: true,
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
  versionUpdateStore: { dismiss: h.dismiss },
}));
vi.mock("./useVersionUpdateAvailable", () => ({
  useVersionUpdateAvailable: () => h.visible,
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
    // The banner is gated behind a startup grace period (setTimeout); fake
    // timers let us fast-forward past it deterministically.
    vi.useFakeTimers();
    h.capture.mockClear();
    h.dismiss.mockClear();
    h.visible = true;
    // Reload is invoked on the Reload click; stub it so jsdom doesn't complain.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: vi.fn() },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Advance past the app-settle grace period so the banner is allowed to render.
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(5000);
    });

  it("stays hidden during the startup grace period, then appears", () => {
    render(<VersionUpdateBanner />);
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    expect(h.capture).not.toHaveBeenCalled();

    settle();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("reports banner_shown once when it appears", () => {
    render(<VersionUpdateBanner />);
    settle();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(h.capture).toHaveBeenCalledWith("version_update:banner_shown");
    expect(
      h.capture.mock.calls.filter(
        (c) => c[0] === "version_update:banner_shown",
      ),
    ).toHaveLength(1);
  });

  it("captures reload_clicked and reloads on Reload", () => {
    render(<VersionUpdateBanner />);
    settle();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(h.capture).toHaveBeenCalledWith("version_update:reload_clicked");
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("captures dismissed and calls the store on Dismiss", () => {
    render(<VersionUpdateBanner />);
    settle();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(h.capture).toHaveBeenCalledWith("version_update:dismissed");
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when no update is available", () => {
    h.visible = false;
    render(<VersionUpdateBanner />);
    settle();
    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
    expect(h.capture).not.toHaveBeenCalled();
  });
});
