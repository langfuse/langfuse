import { renderHook } from "@testing-library/react";
import { useProjectsOverview } from "./useProjectsOverview";

const state = vi.hoisted(() => ({
  requests: [] as Array<{ procedure: string; orgId: string }>,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        v4UpgradeUiAvailable: true,
        organizations: ["org-a", "org-b"].map((id) => ({
          id,
          name: id,
          plan: "oss",
          role: "OWNER",
          projects: [
            {
              id: `${id}-project`,
              name: id,
              role: "OWNER",
              retentionDays: null,
              hasTraces: true,
              deletedAt: null,
            },
          ],
        })),
      },
    },
  }),
}));

vi.mock("@/src/features/v4-migration/useForceV3Experience", () => ({
  useForceV3Experience: () => false,
}));

vi.mock("@/src/utils/api", () => {
  const request =
    (procedure: string) =>
    ({ orgId }: { orgId: string }) => {
      state.requests.push({ procedure, orgId });
      let data: unknown = [];
      if (procedure === "overview") {
        data = {
          projects: [
            {
              projectId: `${orgId}-project`,
              lastTraceAt: new Date(),
              periodUnits: 20,
            },
          ],
          usage: null,
          memberCount: null,
        };
      }
      if (procedure === "integrations") data = { projects: [] };
      return { data, isError: false };
    };
  const router = {
    projectsOverview: { byOrganization: request("overview") },
    v4Transition: {
      summaryByProject: request("integrations"),
      traceLevelEvalSummaryByProject: request("evals"),
      sdkUsageSummaryByProject: request("sdk"),
      legacyApiUsageSummaryByProject: request("apis"),
    },
  };
  return {
    api: {
      useQueries: (build: (routes: typeof router) => unknown[]) =>
        build(router),
    },
  };
});

it("limits overview and migration reads to the selected organization and restores all-org scope", () => {
  state.requests = [];
  const { result, rerender } = renderHook(
    ({ organizationId }) => useProjectsOverview(organizationId),
    {
      initialProps: { organizationId: "org-b" as string | null | undefined },
    },
  );

  expect(result.current.organizations.map((org) => org.id)).toEqual(["org-b"]);
  expect(result.current.organizations[0].projects[0].usage).toEqual({
    units: 20,
    share: 1,
  });
  expect(state.requests).toHaveLength(5);
  expect(new Set(state.requests.map((request) => request.orgId))).toEqual(
    new Set(["org-b"]),
  );

  state.requests = [];
  rerender({ organizationId: null });

  expect(result.current.organizations.map((org) => org.id)).toEqual([
    "org-a",
    "org-b",
  ]);
  expect(state.requests).toHaveLength(10);
  expect(new Set(state.requests.map((request) => request.orgId))).toEqual(
    new Set(["org-a", "org-b"]),
  );

  state.requests = [];
  rerender({ organizationId: undefined });

  expect(result.current.organizations).toEqual([]);
  expect(state.requests).toEqual([]);
});
