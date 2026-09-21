import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";

import useIsFeatureEnabled from "./useIsFeatureEnabled";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockSession = ({
  aiGateway,
  admin = false,
  enableExperimentalFeatures = false,
}: {
  aiGateway: boolean;
  admin?: boolean;
  enableExperimentalFeatures?: boolean;
}) => {
  vi.mocked(useSession).mockReturnValue({
    data: {
      environment: { enableExperimentalFeatures },
      user: {
        admin,
        featureFlags: testFeatureFlags({ aiGateway: false }),
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

  it("does not let admin or experimental-feature overrides enable internal flags", () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        environment: { enableExperimentalFeatures: true },
        user: {
          admin: true,
          featureFlags: { inAppAgentTraceLink: false },
          organizations: [],
        },
      },
    } as unknown as ReturnType<typeof useSession>);

    const { result } = renderHook(() =>
      useIsFeatureEnabled("inAppAgentTraceLink"),
    );

    expect(result.current).toBe(false);
  });
});
