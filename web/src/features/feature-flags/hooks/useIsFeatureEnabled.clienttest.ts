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
  emailVerified,
  enableExperimentalFeatures = false,
  internalFeatures,
}: {
  aiGateway: boolean;
  langfuseTopics?: boolean;
  admin?: boolean;
  email?: string;
  emailVerified?: string | null;
  enableExperimentalFeatures?: boolean;
  internalFeatures?: boolean;
}) => {
  vi.mocked(useSession).mockReturnValue({
    data: {
      environment: { enableExperimentalFeatures },
      user: {
        admin,
        email,
        emailVerified,
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
    {
      admin: false,
      email: "member@clickhouse.com",
      emailVerified: "2026-01-01T00:00:00.000Z",
      internalFeatures: false,
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
    ["member@langfuse.com", true, true],
    ["MEMBER@CLICKHOUSE.COM", true, true],
    ["member@sub.langfuse.com", true, false],
    ["member@sub.clickhouse.com", true, false],
    ["member@langfuse.com.example.org", true, false],
    ["member@clickhouse.com.example.org", true, false],
    ["member@notlangfuse.com", true, false],
    ["member@notclickhouse.com", true, false],
    ["member@langfuse.com", false, false],
  ] as const)(
    "internal view for %s (verified=%s): %s",
    (email, verified, expected) => {
      mockSession({
        aiGateway: false,
        email,
        emailVerified: verified ? "2026-01-01T00:00:00.000Z" : null,
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
    },
  );

  it("requires explicit opt-in for restricted and admin-only flags despite admin and experimental overrides", () => {
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
