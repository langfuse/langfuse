import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { vi } from "vitest";

import { useV4UpgradeUiEnabled } from "./useV4UpgradeUiEnabled";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockUseSession = vi.mocked(useSession);

const mockSessionAvailability = (v4UpgradeUiAvailable: boolean) => {
  mockUseSession.mockReturnValue({
    data: {
      user: {
        featureFlags: testFeatureFlags({ templateFlag: false }),
        v4UpgradeUiAvailable,
      },
      environment: { enableExperimentalFeatures: false },
    },
  } as never);
};

describe("useV4UpgradeUiEnabled", () => {
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

  it("does not enable the UI for experimental deployments", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          featureFlags: testFeatureFlags({ templateFlag: false }),
          v4UpgradeUiAvailable: false,
        },
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
        user: {
          featureFlags: testFeatureFlags({ templateFlag: false }),
        },
        environment: { enableExperimentalFeatures: false },
      },
    } as never);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(false);
  });
});
