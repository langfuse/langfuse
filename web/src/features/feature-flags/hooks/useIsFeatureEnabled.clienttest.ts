import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";

import useIsFeatureEnabled from "./useIsFeatureEnabled";
import { useInternalFeaturesEnabled } from "./useInternalFeaturesEnabled";
import { INTERNAL_FEATURE_FLAG } from "../available-flags";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockSession = ({
  aiGateway,
  langfuseTopics = false,
  enableExperimentalFeatures = false,
  internalFeatures,
}: {
  aiGateway: boolean;
  langfuseTopics?: boolean;
  enableExperimentalFeatures?: boolean;
  internalFeatures?: boolean;
}) => {
  vi.mocked(useSession).mockReturnValue({
    data: {
      environment: { enableExperimentalFeatures },
      user: {
        featureFlags: testFeatureFlags({
          aiGateway: false,
          langfuseTopics,
          [INTERNAL_FEATURE_FLAG]: internalFeatures,
        }),
        organizations: [
          {
            id: "org-1",
            featureFlags: testFeatureFlags({ aiGateway, langfuseTopics }),
            projects: [],
          },
        ],
      },
    },
  } as unknown as ReturnType<typeof useSession>);
};

describe("useIsFeatureEnabled", () => {
  it.each([
    {
      internalFeatures: false,
      enableExperimentalFeatures: true,
      expected: false,
    },
    {
      internalFeatures: true,
      enableExperimentalFeatures: true,
      expected: true,
    },
    {
      internalFeatures: undefined,
      enableExperimentalFeatures: true,
      expected: true,
    },
    {
      internalFeatures: true,
      enableExperimentalFeatures: false,
      expected: false,
    },
  ])(
    "resolves internal view as $expected for experimental=$enableExperimentalFeatures / $internalFeatures preference",
    ({ expected, ...options }) => {
      mockSession({ aiGateway: false, ...options });
      const { result } = renderHook(() => useInternalFeaturesEnabled());
      expect(result.current).toBe(expected);
    },
  );

  it("requires explicit opt-in for restricted and internal-only flags despite experimental overrides", () => {
    mockSession({
      aiGateway: false,
      enableExperimentalFeatures: true,
    });
    const { result, rerender } = renderHook(() => ({
      aiGateway: useIsFeatureEnabled("aiGateway", { organizationId: "org-1" }),
      langfuseTopics: useIsFeatureEnabled("langfuseTopics"),
    }));
    expect(result.current).toEqual({ aiGateway: false, langfuseTopics: false });

    mockSession({ aiGateway: true, langfuseTopics: true });
    rerender();
    expect(result.current).toEqual({ aiGateway: true, langfuseTopics: true });
  });
});
