import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import { ROUTES, type Route } from "@/src/components/layouts/routes";
import { applyNavigationFilters } from "./navigationFilters";
import type { NavigationFilterContext } from "./navigationFilters.types";

it("keeps Topics hidden without explicit opt-in despite admin and experimental overrides", () => {
  const route: Route = {
    title: "Topics",
    href: "/topics",
    featureFlag: "langfuseTopics",
  };
  const context: NavigationFilterContext = {
    routerProjectId: undefined,
    routerOrganizationId: undefined,
    session: {
      user: { featureFlags: testFeatureFlags({ langfuseTopics: false }) },
    } as Session,
    enableExperimentalFeatures: true,
    internalFeaturesEnabled: false,
    cloudAdmin: true,
    entitlements: [],
    uiCustomization: null,
    isLangfuseCloud: true,
    hasActiveCloudIncident: false,
    forceV3Experience: false,
    currentPath: "/topics",
  };
  expect(applyNavigationFilters([route], context, undefined)).toEqual([]);
  context.session!.user!.featureFlags.langfuseTopics = true;
  expect(applyNavigationFilters([route], context, undefined)).toEqual([route]);
});

it.each([
  { forceV3Experience: true, visible: false },
  { forceV3Experience: false, visible: true },
])(
  "recovery visibility is $visible when forceV3Experience is $forceV3Experience",
  ({ forceV3Experience, visible }) => {
    const route = ROUTES.find(
      (route) => route.featureFlag === "v4BetaToggleVisible",
    )!;
    const context: NavigationFilterContext = {
      routerProjectId: "project-1",
      routerOrganizationId: undefined,
      session: {
        user: {
          canToggleV4: false,
          v4BetaEnabled: false,
          v4UpgradeUiAvailable: true,
          featureFlags: testFeatureFlags({}),
        },
        environment: { v4WriteMode: "dual" },
      } as Session,
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      cloudAdmin: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: true,
      hasActiveCloudIncident: false,
      forceV3Experience,
      currentPath: "/project/project-1",
    };

    expect(applyNavigationFilters([route], context, undefined)).toEqual(
      visible ? [route] : [],
    );

    context.routerProjectId = undefined;
    expect(applyNavigationFilters([route], context, undefined)).toEqual([]);
  },
);

it.each([
  { topicsEnabled: true, visible: true },
  { topicsEnabled: false, visible: false },
])(
  "shows the Topics entry only when the gate passes for the current project (allowlisted: $topicsEnabled)",
  ({ topicsEnabled, visible }) => {
    const route = ROUTES.find((route) => route.title === "Topics")!;
    const project = { id: "project-1", role: "VIEWER", topicsEnabled };
    const organization = {
      id: "org-1",
      role: "VIEWER",
      projects: [project],
    } as unknown as NonNullable<Session["user"]>["organizations"][number];
    const context: NavigationFilterContext = {
      routerProjectId: "project-1",
      routerOrganizationId: undefined,
      session: {
        user: {
          admin: false,
          featureFlags: testFeatureFlags({ langfuseTopics: true }),
          organizations: [organization],
        },
      } as Session,
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      cloudAdmin: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: true,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
      currentPath: "/project/project-1",
    };

    expect(applyNavigationFilters([route], context, organization)).toEqual(
      visible ? [route] : [],
    );
  },
);

it.each([
  { role: "AI_GATEWAY", projects: [], visible: false },
  { role: "AI_GATEWAY", projects: [{ id: "project-1" }], visible: true },
  { role: "NONE", projects: [], visible: true },
])(
  "shows Projects to $role members with $projects.length projects: $visible",
  ({ role, projects, visible }) => {
    const route = ROUTES.find((route) => route.title === "Projects")!;
    const organization = {
      id: "org-1",
      role,
      projects,
    } as unknown as NonNullable<Session["user"]>["organizations"][number];
    const context: NavigationFilterContext = {
      routerProjectId: undefined,
      routerOrganizationId: "org-1",
      session: {
        user: {
          admin: false,
          featureFlags: testFeatureFlags({}),
          organizations: [organization],
        },
      } as Session,
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      cloudAdmin: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: false,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
      currentPath: "/organization/org-1",
    };

    expect(applyNavigationFilters([route], context, organization)).toEqual(
      visible ? [route] : [],
    );
  },
);
