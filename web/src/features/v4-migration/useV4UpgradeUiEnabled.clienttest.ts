import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { vi } from "vitest";

import { useV4UpgradeUiEnabled } from "./useV4UpgradeUiEnabled";
import { useForceV3Experience } from "./useForceV3Experience";
import { parseFlags } from "@/src/features/feature-flags/utils";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("./useForceV3Experience", () => ({
  useForceV3Experience: vi.fn(),
}));

const mockUseSession = vi.mocked(useSession);
const mockUseForceV3Experience = vi.mocked(useForceV3Experience);

const mockSessionFlag = (v4UpgradeUi: boolean) => {
  mockUseSession.mockReturnValue({
    data: {
      user: {
        admin: false,
        featureFlags: { v4UpgradeUi },
      },
      environment: { enableExperimentalFeatures: false },
    },
  } as never);
};

describe("useV4UpgradeUiEnabled", () => {
  beforeEach(() => {
    mockUseForceV3Experience.mockReturnValue(false);
  });

  it("maps the database flag into the session flag shape", () => {
    const context = { email: undefined, v4BetaEnabled: false };
    expect(parseFlags(["v4UpgradeUi"], context).v4UpgradeUi).toBe(true);
    expect(parseFlags([], context).v4UpgradeUi).toBe(false);
  });

  it("does not enable the UI for admins or experimental deployments", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          admin: true,
          featureFlags: { v4UpgradeUi: false },
        },
        environment: { enableExperimentalFeatures: true },
      },
    } as never);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });

  it("enables the UI only when the user flag is set", () => {
    mockSessionFlag(true);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(true);
  });

  it("suppresses the UI for projects forced onto the v3 experience", () => {
    mockSessionFlag(true);
    mockUseForceV3Experience.mockReturnValue(true);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });

  it("stays disabled when the flag is off regardless of force-v3", () => {
    mockSessionFlag(false);
    mockUseForceV3Experience.mockReturnValue(false);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });
});
