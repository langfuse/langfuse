import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LegacyUiBanner, useLegacyUiBannerVisible } from "./LegacyUiBanner";

const mocks = vi.hoisted(() => ({
  isV3Legacy: true,
  isResolved: true,
  forceV3: false,
  hasDeadline: true,
  isLoading: false,
  handleToggle: vi.fn(),
  showIntroDialog: false,
  confirmIntroDialog: vi.fn(),
  dismissIntroDialog: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({
    isV3Legacy: mocks.isV3Legacy,
    isResolved: mocks.isResolved,
    isV4: !mocks.isV3Legacy,
    canToggleV4: true,
    readPath: mocks.isV3Legacy ? "v3" : "v4",
  }),
}));

vi.mock("@/src/features/v4-migration/useForceV3Experience", () => ({
  useForceV3Experience: () => mocks.forceV3,
}));

vi.mock("@/src/features/v4-migration/V4MigrationContent", () => ({
  V4_MIGRATION_DEADLINE: "November 16, 2026",
  useHasV4MigrationDeadline: () => mocks.hasDeadline,
}));

vi.mock("@/src/features/events/hooks/useV4PreviewToggle", () => ({
  useV4PreviewToggle: () => ({
    isChecked: false,
    isLoading: mocks.isLoading,
    handleToggle: mocks.handleToggle,
    showIntroDialog: mocks.showIntroDialog,
    confirmIntroDialog: mocks.confirmIntroDialog,
    dismissIntroDialog: mocks.dismissIntroDialog,
  }),
}));

vi.mock("@/src/features/events/components/V4IntroDialog", () => ({
  V4IntroDialog: () => null,
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

describe("useLegacyUiBannerVisible", () => {
  beforeEach(() => {
    mocks.isV3Legacy = true;
    mocks.isResolved = true;
    mocks.forceV3 = false;
  });

  it("is true for opted-out users outside force-v3 projects", () => {
    const { result } = renderHook(() => useLegacyUiBannerVisible("proj-1"));
    expect(result.current).toBe(true);
  });

  it("is false for force-v3 projects", () => {
    mocks.forceV3 = true;
    const { result } = renderHook(() => useLegacyUiBannerVisible("proj-1"));
    expect(result.current).toBe(false);
  });

  it("is false when the user is already on v4", () => {
    mocks.isV3Legacy = false;
    const { result } = renderHook(() => useLegacyUiBannerVisible("proj-1"));
    expect(result.current).toBe(false);
  });

  it("is false while the read path is unresolved", () => {
    mocks.isResolved = false;
    const { result } = renderHook(() => useLegacyUiBannerVisible("proj-1"));
    expect(result.current).toBe(false);
  });
});

describe("LegacyUiBanner", () => {
  beforeEach(() => {
    mocks.hasDeadline = true;
    mocks.isLoading = false;
    mocks.handleToggle.mockReset();
    mocks.capture.mockReset();
  });

  it("enables v4 from the primary CTA and links migration status", () => {
    render(<LegacyUiBanner />);

    expect(screen.getByText(/You're on the legacy UI/)).toBeInTheDocument();
    expect(screen.getByText(/November 16, 2026/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Migration status" }),
    ).toHaveAttribute("href", "/v4-migration");

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to latest UI" }),
    );
    expect(mocks.handleToggle).toHaveBeenCalledWith(true);
  });

  it("omits the retirement date when there is no Cloud deadline", () => {
    mocks.hasDeadline = false;
    render(<LegacyUiBanner />);
    expect(screen.queryByText(/November 16, 2026/)).not.toBeInTheDocument();
    expect(screen.getByText(/It will be retired\./)).toBeInTheDocument();
  });
});
