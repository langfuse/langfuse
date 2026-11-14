import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { ROUTES, type Route } from "@/src/components/layouts/routes";
import { applyNavigationFilters } from "./navigationFilters";
import type { NavigationFilterContext } from "./navigationFilters.types";
import {
  testSession,
  type TestOrganization,
} from "@/src/__tests__/fixtures/principal";
import {
  findSessionOrganization,
  getPrincipalUser,
} from "@/src/features/rbac/new/sessionAccessors";

it.each([
  { flag: "langfuseTopics", enableExperimentalFeatures: true },
  { flag: "sessionViewV2", enableExperimentalFeatures: false },
] as const)(
  "keeps $flag hidden without opt-in",
  ({ flag, enableExperimentalFeatures }) => {
    const route: Route = {
      title: "Preview",
      href: "/preview",
      featureFlag: flag,
    };
    const context: NavigationFilterContext = {
      routerProjectId: undefined,
      routerOrganizationId: undefined,
      session: testSession({
        user: { featureFlags: testFeatureFlags({ [flag]: false }) },
      }),
      enableExperimentalFeatures,
      internalFeaturesEnabled: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: true,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
    };
    expect(applyNavigationFilters([route], context, undefined)).toEqual([]);
    getPrincipalUser(context.session)!.featureFlags[flag] = true;
    expect(applyNavigationFilters([route], context, undefined)).toEqual([
      route,
    ]);
  },
);

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
      session: testSession({
        user: {
          canToggleV4: false,
          v4BetaEnabled: false,
          v4UpgradeUiAvailable: true,
          featureFlags: testFeatureFlags({}),
        },
        environment: { v4WriteMode: "dual" },
      }),
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: true,
      hasActiveCloudIncident: false,
      forceV3Experience,
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
    } as TestOrganization;
    const context: NavigationFilterContext = {
      routerProjectId: "project-1",
      routerOrganizationId: undefined,
      session: testSession({
        user: { featureFlags: testFeatureFlags({ langfuseTopics: true }) },
        organizations: [organization],
      }),
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: true,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
    };

    expect(
      applyNavigationFilters(
        [route],
        context,
        findSessionOrganization(context.session, "org-1"),
      ),
    ).toEqual(visible ? [route] : []);
  },
);

it.each([
  { title: "Projects", role: "AI_GATEWAY", projects: [], visible: true },
  { title: "Settings", role: "AI_GATEWAY", projects: [], visible: false },
  {
    title: "Settings",
    role: "AI_GATEWAY",
    projects: [{ id: "project-1" }],
    visible: false,
  },
  { title: "Settings", role: "NONE", projects: [], visible: true },
])(
  "shows $title to $role members with $projects.length projects: $visible",
  ({ title, role, projects, visible }) => {
    const route = ROUTES.find(
      (route) =>
        route.title === title && route.href.startsWith("/organization/"),
    )!;
    const organization = {
      id: "org-1",
      role,
      projects,
    } as TestOrganization;
    const context: NavigationFilterContext = {
      routerProjectId: undefined,
      routerOrganizationId: "org-1",
      session: testSession({
        user: { featureFlags: testFeatureFlags({}) },
        organizations: [organization],
        environment: { aiGatewayDeployed: true },
      }),
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: false,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
    };

    expect(
      applyNavigationFilters(
        [route],
        context,
        findSessionOrganization(context.session, "org-1"),
      ),
    ).toEqual(visible ? [route] : []);
  },
);

it("shows the AI Gateway pages among the organization routes", () => {
  const organization = {
    id: "org-1",
    role: "OWNER",
    projects: [],
    featureFlagDefaults: testFeatureFlags({ aiGateway: true }),
  } as TestOrganization;
  const context: NavigationFilterContext = {
    routerProjectId: undefined,
    routerOrganizationId: "org-1",
    session: testSession({
      user: { featureFlags: testFeatureFlags({}) },
      organizations: [organization],
      environment: { aiGatewayDeployed: true },
    }),
    enableExperimentalFeatures: false,
    internalFeaturesEnabled: false,
    entitlements: [],
    uiCustomization: null,
    isLangfuseCloud: false,
    hasActiveCloudIncident: false,
    forceV3Experience: false,
  };

  expect(
    applyNavigationFilters(
      ROUTES,
      context,
      findSessionOrganization(context.session, "org-1"),
    )
      .filter(
        (route) =>
          route.href.includes("[organizationId]") ||
          route.id === "gateway-ingestion-project",
      )
      .map((route) => route.title),
  ).toEqual([
    "Projects",
    "Overview",
    "Connections & Models",
    "Gateway keys",
    "Tracing",
    "Settings",
  ]);
});
