import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { vi } from "vitest";

import { useV4UpgradeUiEnabled } from "./useV4UpgradeUiEnabled";
import { useForceV3Experience } from "./useForceV3Experience";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("./useForceV3Experience", () => ({
  useForceV3Experience: vi.fn(),
}));

const mockUseSession = vi.mocked(useSession);
const mockUseForceV3Experience = vi.mocked(useForceV3Experience);

const mockSessionAvailability = (v4UpgradeUiAvailable: boolean) => {
  mockUseSession.mockReturnValue({
    data: {
      user: { admin: false, featureFlags: {}, v4UpgradeUiAvailable },
      environment: { enableExperimentalFeatures: false },
    },
  } as never);
};

describe("useV4UpgradeUiEnabled", () => {
  beforeEach(() => {
    mockUseForceV3Experience.mockReturnValue(false);
  });

  it("enables the UI when the deployment can act on the migration", () => {
    mockSessionAvailability(true);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(true);
  });

  it("stays disabled when the deployment cannot act on the migration", () => {
    mockSessionAvailability(false);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });

  it("does not enable the UI for admins or experimental deployments", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { admin: true, featureFlags: {}, v4UpgradeUiAvailable: false },
        environment: { enableExperimentalFeatures: true },
      },
    } as never);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });

  it("treats a session without the field as unavailable", () => {
    // Older sessions and test fixtures predate the field; default to off rather
    // than showing migration surfaces a deployment may not support.
    mockUseSession.mockReturnValue({
      data: {
        user: { admin: false, featureFlags: {} },
        environment: { enableExperimentalFeatures: false },
      },
    } as never);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });

  it("suppresses the UI for projects forced onto the v3 experience", () => {
    mockSessionAvailability(true);
    mockUseForceV3Experience.mockReturnValue(true);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });
});
