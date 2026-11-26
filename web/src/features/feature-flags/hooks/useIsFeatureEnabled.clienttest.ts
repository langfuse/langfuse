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
  traceTranscriptEvals = false,
  email,
  enableExperimentalFeatures = false,
  internalFeatures,
  unifiedTraceSessionView = false,
}: {
  aiGateway: boolean;
  traceTranscriptEvals?: boolean;
  email?: string;
  enableExperimentalFeatures?: boolean;
  internalFeatures?: boolean;
  unifiedTraceSessionView?: boolean;
}) => {
  vi.mocked(useSession).mockReturnValue({
    data: {
      environment: { enableExperimentalFeatures },
      user: {
        email,
        featureFlags: testFeatureFlags({
          aiGateway: false,
          traceTranscriptEvals,
          unifiedTraceSessionView,
          [INTERNAL_FEATURE_FLAG]: internalFeatures,
        }),
        organizations: [
          {
            id: "org-1",
            featureFlags: testFeatureFlags({ aiGateway, traceTranscriptEvals }),
            projects: [],
          },
        ],
      },
    },
  } as unknown as ReturnType<typeof useSession>);
};

describe("useIsFeatureEnabled", () => {
  it.each([false, true])(
    "honors unified trace/session opt-in (%s), independent of internal access",
    (unifiedTraceSessionView) => {
      mockSession({
        aiGateway: false,
        email: "staff@clickhouse.com",
        enableExperimentalFeatures: false,
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
  it("enables the unified preview on experimental deployments", () => {
    mockSession({
      aiGateway: false,
      enableExperimentalFeatures: true,
      unifiedTraceSessionView: false,
    });
    const { result } = renderHook(() =>
      useIsFeatureEnabled("unifiedTraceSessionView"),
    );
    expect(result.current).toBe(true);
  });
  it("honors preview preferences for internal users while preserving the deployment override", () => {
    mockSession({ aiGateway: false, email: "staff@clickhouse.com" });
    const { result, rerender } = renderHook(() =>
      useIsFeatureEnabled("sessionViewV2"),
    );
    expect(result.current).toBe(false);

    mockSession({
      aiGateway: false,
      email: "staff@clickhouse.com",
      enableExperimentalFeatures: true,
    });
    rerender();
    expect(result.current).toBe(true);
  });

  it.each([
    {
      email: "staff@clickhouse.com",
      internalFeatures: false,
      enableExperimentalFeatures: true,
      expected: false,
    },
    {
      email: "staff@clickhouse.com",
      internalFeatures: true,
      enableExperimentalFeatures: false,
      expected: true,
    },
    {
      email: "user@example.com",
      internalFeatures: true,
      enableExperimentalFeatures: false,
      expected: false,
    },
  ])(
    "resolves internal view as $expected for $email / $internalFeatures preference",
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
      aiGateway: useIsFeatureEnabled("aiGateway"),
      traceTranscriptEvals: useIsFeatureEnabled("traceTranscriptEvals"),
    }));
    expect(result.current).toEqual({
      internal: expected,
      aiGateway: false,
      traceTranscriptEvals: false,
    });
  });

  it("requires explicit opt-in for restricted and internal preview flags even for internal users on experimental deployments", () => {
    mockSession({
      aiGateway: false,
      email: "staff@clickhouse.com",
      enableExperimentalFeatures: true,
    });
    const { result, rerender } = renderHook(() => ({
      aiGateway: useIsFeatureEnabled("aiGateway", { organizationId: "org-1" }),
      traceTranscriptEvals: useIsFeatureEnabled("traceTranscriptEvals"),
    }));
    expect(result.current).toEqual({
      aiGateway: false,
      traceTranscriptEvals: false,
    });

    mockSession({ aiGateway: true, traceTranscriptEvals: true });
    rerender();
    expect(result.current).toEqual({
      aiGateway: true,
      traceTranscriptEvals: true,
    });
  });
});
