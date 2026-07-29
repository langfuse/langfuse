import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { vi } from "vitest";

import { useV4UpgradeUiEnabled } from "./useV4UpgradeUiEnabled";
import { parseFlags } from "@/src/features/feature-flags/utils";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockUseSession = vi.mocked(useSession);

describe("useV4UpgradeUiEnabled", () => {
  it("maps the database flag into the session flag shape", () => {
    expect(parseFlags(["v4UpgradeUi"]).v4UpgradeUi).toBe(true);
    expect(parseFlags([]).v4UpgradeUi).toBe(false);
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
    mockUseSession.mockReturnValue({
      data: {
        user: {
          admin: false,
          featureFlags: { v4UpgradeUi: true },
        },
        environment: { enableExperimentalFeatures: false },
      },
    } as never);

    const { result } = renderHook(() => useV4UpgradeUiEnabled());

    expect(result.current).toBe(true);
  });
});
