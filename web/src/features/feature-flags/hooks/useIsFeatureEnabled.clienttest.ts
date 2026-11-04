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
  admin = false,
  email,
  enableExperimentalFeatures = false,
  internalFeatures,
  unifiedTraceSessionView = false,
}: {
  aiGateway: boolean;
  langfuseTopics?: boolean;
  admin?: boolean;
  email?: string;
  enableExperimentalFeatures?: boolean;
  internalFeatures?: boolean;
  unifiedTraceSessionView?: boolean;
}) => {
  vi.mocked(useSession).mockReturnValue({
    data: {
      environment: { enableExperimentalFeatures },
      user: {
        admin,
        email,
        featureFlags: testFeatureFlags({
          aiGateway: false,
          langfuseTopics,
          unifiedTraceSessionView,
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
  it.each([false, true])(
    "requires explicit unified trace/session opt-in (%s), independent of internal access",
    (unifiedTraceSessionView) => {
      mockSession({
        aiGateway: false,
        admin: true,
        enableExperimentalFeatures: true,
        internalFeatures: true,
        unifiedTraceSessionView,
      });
      const { result, rerender } = renderHook(() =>
        useIsFeatureEnabled("unifiedTraceSessionView", {
          projectId: "project-1",
        }),
      );
      expect(result.current).toBe(unifiedTraceSessionView);

      mockSession({ aiGateway: false, unifiedTraceSessionView });
      rerender();
      expect(result.current).toBe(unifiedTraceSessionView);
    },
  );
  it("honors preview preferences for admins while preserving the deployment override", () => {
    mockSession({ aiGateway: false, admin: true });
    const { result, rerender } = renderHook(() =>
      useIsFeatureEnabled("sessionViewV2"),
    );
    expect(result.current).toBe(false);

    mockSession({
      aiGateway: false,
      admin: true,
      enableExperimentalFeatures: true,
    });
    rerender();
    expect(result.current).toBe(true);
  });

  it.each([
    {
      admin: true,
      internalFeatures: false,
      enableExperimentalFeatures: true,
      expected: false,
    },
    {
      admin: true,
      internalFeatures: true,
      enableExperimentalFeatures: false,
      expected: true,
    },
    {
      admin: false,
      internalFeatures: true,
      enableExperimentalFeatures: false,
      expected: false,
    },
  ])(
    "resolves internal view as $expected for $admin admin / $internalFeatures preference",
    ({ expected, ...options }) => {
      mockSession({ aiGateway: false, ...options });
      const { result } = renderHook(() => useInternalFeaturesEnabled());
      expect(result.current).toBe(expected);
    },
  );

  it.each([
    ["member@langfuse.com", true],
    ["MEMBER@CLICKHOUSE.COM", true],
    ["member@sub.langfuse.com", false],
    ["member@clickhouse.com.example.org", false],
    ["member@notclickhouse.com", false],
  ] as const)("internal view for %s: %s", (email, expected) => {
    mockSession({
      aiGateway: false,
      email,
    });
    const { result } = renderHook(() => ({
      internal: useInternalFeaturesEnabled(),
      searchBar: useIsFeatureEnabled("searchBar"),
      aiGateway: useIsFeatureEnabled("aiGateway"),
      langfuseTopics: useIsFeatureEnabled("langfuseTopics"),
    }));
    expect(result.current).toEqual({
      internal: expected,
      searchBar: false,
      aiGateway: false,
      langfuseTopics: false,
    });
  });

  it("requires explicit opt-in for restricted and internal preview flags even for admins on experimental deployments", () => {
    mockSession({
      aiGateway: false,
      admin: true,
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
