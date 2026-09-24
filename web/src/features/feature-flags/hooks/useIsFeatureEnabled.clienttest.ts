import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";

import useIsFeatureEnabled from "./useIsFeatureEnabled";
import { INTERNAL_FEATURE_FLAG } from "../available-flags";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockSession = ({
  aiGateway,
  admin = false,
  enableExperimentalFeatures = false,
  internalFeatures,
}: {
  aiGateway: boolean;
  admin?: boolean;
  enableExperimentalFeatures?: boolean;
  internalFeatures?: boolean;
}) => {
  vi.mocked(useSession).mockReturnValue({
    data: {
      environment: { enableExperimentalFeatures },
      user: {
        admin,
        featureFlags: testFeatureFlags({
          aiGateway: false,
          [INTERNAL_FEATURE_FLAG]: internalFeatures,
        }),
        organizations: [
          {
            id: "org-1",
            featureFlags: testFeatureFlags({ aiGateway }),
            projects: [],
          },
        ],
      },
    },
  } as unknown as ReturnType<typeof useSession>);
};

describe("useIsFeatureEnabled", () => {
  it("does not let admin or experimental-feature overrides enable restricted flags", () => {
    mockSession({
      aiGateway: false,
      admin: true,
      enableExperimentalFeatures: true,
    });

    const { result } = renderHook(() =>
      useIsFeatureEnabled("aiGateway", { organizationId: "org-1" }),
    );

    expect(result.current).toBe(false);
  });

  it("returns the server-resolved organization flag", () => {
    mockSession({ aiGateway: true });

    const { result } = renderHook(() =>
      useIsFeatureEnabled("aiGateway", { organizationId: "org-1" }),
    );

    expect(result.current).toBe(true);
  });
});
