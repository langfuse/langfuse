import { renderHook } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { useUiExportsDisabledReason } from "./useUiExportsDisabledReason";

const mockRouter = {
  query: { projectId: "route-project" },
} as unknown as NextRouter;

function makeSession(overrides: {
  uiExportsDisabledByInstance?: boolean;
  uiExportsDisabled?: boolean;
}): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    policies: [],
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
      uiExportsDisabledByInstance:
        overrides.uiExportsDisabledByInstance ?? false,
    },
    user: {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      canCreateOrganizations: true,
      featureFlags: testFeatureFlags(),
      organizations: [
        {
          id: "org-1",
          name: "Org 1",
          cloudConfig: undefined,
          plan: "cloud:enterprise",
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          uiExportsDisabled: overrides.uiExportsDisabled ?? false,
          projects: [
            {
              id: "project-1",
              name: "Project 1",
              deletedAt: null,
              retentionDays: null,
              hasTraces: true,
              metadata: {},
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "route-project",
              name: "Route Project",
              deletedAt: null,
              retentionDays: null,
              hasTraces: true,
              metadata: {},
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    },
  };
}

function wrap(session: Session | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <RouterContext.Provider value={mockRouter}>
        <SessionProvider session={session}>{children}</SessionProvider>
      </RouterContext.Provider>
    );
  };
}

describe("useUiExportsDisabledReason", () => {
  it("returns the instance reason when disabled by the instance", () => {
    const { result } = renderHook(
      () => useUiExportsDisabledReason({ projectId: "project-1" }),
      {
        wrapper: wrap(makeSession({ uiExportsDisabledByInstance: true })),
      },
    );

    expect(result.current).toMatch(/disabled on this instance/i);
  });

  it("returns the org reason when disabled for the project, org, or route project", () => {
    const session = makeSession({ uiExportsDisabled: true });

    expect(
      renderHook(() => useUiExportsDisabledReason({ projectId: "project-1" }), {
        wrapper: wrap(session),
      }).result.current,
    ).toMatch(/disabled for this organization/i);

    expect(
      renderHook(() => useUiExportsDisabledReason({ orgId: "org-1" }), {
        wrapper: wrap(session),
      }).result.current,
    ).toMatch(/disabled for this organization/i);

    expect(
      renderHook(() => useUiExportsDisabledReason(), {
        wrapper: wrap(session),
      }).result.current,
    ).toMatch(/disabled for this organization/i);
  });

  it("returns null when enabled or rendered without a SessionProvider", () => {
    expect(
      renderHook(() => useUiExportsDisabledReason({ projectId: "project-1" }), {
        wrapper: wrap(makeSession({})),
      }).result.current,
    ).toBeNull();

    expect(
      renderHook(() => useUiExportsDisabledReason({ projectId: "project-1" }))
        .result.current,
    ).toBeNull();
  });
});
