import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopBannerProvider } from "@/src/features/top-banner";
import { VersionUpdateBanner } from "./VersionUpdateBanner";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";
import { versionUpdateStore } from "./versionUpdateStore";

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
    // The running build id the tab loaded; a differing observed id is the
    // trigger. ResizeObserver is used by the shared top-banner registration and
    // is not implemented in jsdom.
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "running-build");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("appears when a newer build is observed and hides on dismiss", () => {
    // A newer build was deployed while the tab stayed open.
    versionUpdateStore.reportObservedBuildId("deployed-build");

    render(
      <TopBannerProvider>
        <VersionUpdateBanner />
      </TopBannerProvider>,
    );

    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(
      screen.queryByRole("button", { name: "Reload" }),
    ).not.toBeInTheDocument();
  });
});
