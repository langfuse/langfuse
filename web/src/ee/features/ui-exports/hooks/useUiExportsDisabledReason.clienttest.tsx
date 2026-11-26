import { renderHook } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { UiExportsPolicyProvider } from "@/src/ee/features/ui-exports/components/UiExportsPolicyProvider";
import {
  UI_EXPORTS_DISABLED_BY_INSTANCE_REASON,
  UI_EXPORTS_DISABLED_BY_ORG_REASON,
} from "@/src/ee/features/ui-exports/constants";
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

  it("falls back to UiExportsPolicyProvider or fallbackReason for public anonymous and cross-org viewers", () => {
    const withPolicy = (
      session: Session | null,
      disabledReason: string | null,
    ) =>
      function PolicyWrapper({ children }: { children: ReactNode }) {
        return (
          <RouterContext.Provider value={mockRouter}>
            <SessionProvider session={session}>
              <UiExportsPolicyProvider disabledReason={disabledReason}>
                {children}
              </UiExportsPolicyProvider>
            </SessionProvider>
          </RouterContext.Provider>
        );
      };

    // Anonymous viewer on a public trace/session
    expect(
      renderHook(
        () => useUiExportsDisabledReason({ projectId: "other-proj" }),
        {
          wrapper: withPolicy(null, UI_EXPORTS_DISABLED_BY_INSTANCE_REASON),
        },
      ).result.current,
    ).toBe(UI_EXPORTS_DISABLED_BY_INSTANCE_REASON);

    // Signed-in non-member viewing another org's public trace/session
    expect(
      renderHook(
        () => useUiExportsDisabledReason({ projectId: "other-proj" }),
        {
          wrapper: withPolicy(
            makeSession({}),
            UI_EXPORTS_DISABLED_BY_ORG_REASON,
          ),
        },
      ).result.current,
    ).toBe(UI_EXPORTS_DISABLED_BY_ORG_REASON);

    // Direct fallbackReason when no provider wraps the caller
    expect(
      renderHook(
        () =>
          useUiExportsDisabledReason({
            projectId: "other-proj",
            fallbackReason: UI_EXPORTS_DISABLED_BY_ORG_REASON,
          }),
        { wrapper: wrap(null) },
      ).result.current,
    ).toBe(UI_EXPORTS_DISABLED_BY_ORG_REASON);

    // Org member's own live session takes precedence over a stale context reason
    expect(
      renderHook(() => useUiExportsDisabledReason({ projectId: "project-1" }), {
        wrapper: withPolicy(
          makeSession({ uiExportsDisabled: false }),
          UI_EXPORTS_DISABLED_BY_ORG_REASON,
        ),
      }).result.current,
    ).toBeNull();
  });
});
