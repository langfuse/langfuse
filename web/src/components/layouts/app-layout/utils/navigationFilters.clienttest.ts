import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { env } from "@/src/env.mjs";
import type { Session } from "next-auth";
import type { Role } from "@langfuse/shared";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { ROUTES, type Route } from "@/src/components/layouts/routes";
import { applyNavigationFilters } from "./navigationFilters";
import type { NavigationFilterContext } from "./navigationFilters.types";

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
      session: {
        user: { featureFlags: testFeatureFlags({ [flag]: false }) },
      } as Session,
      enableExperimentalFeatures,
      internalFeaturesEnabled: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: true,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
    };
    expect(applyNavigationFilters([route], context, undefined)).toEqual([]);
    context.session!.user!.featureFlags[flag] = true;
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
    const session = createSession({
      user: { featureFlags: testFeatureFlags({ langfuseTopics: true }) },
      organizations: [
        {
          id: "org-1",
          role: "VIEWER",
          projects: [{ id: "project-1", topicsEnabled }],
        },
      ],
    });
    const organization = session.user.organizations[0]!;
    const context: NavigationFilterContext = {
      routerProjectId: "project-1",
      routerOrganizationId: undefined,
      session,
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: true,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
    };

    expect(applyNavigationFilters([route], context, organization)).toEqual(
      visible ? [route] : [],
    );
  },
);

it.each<{
  title: string;
  role: Role;
  projects: { id: string }[];
  visible: boolean;
}>([
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
    const session = createSession({
      user: { featureFlags: testFeatureFlags({}) },
      organizations: [{ id: "org-1", role, projects }],
      environment: { aiGatewayDeployed: true },
    });
    const organization = session.user.organizations[0]!;
    const context: NavigationFilterContext = {
      routerProjectId: undefined,
      routerOrganizationId: "org-1",
      session,
      enableExperimentalFeatures: false,
      internalFeaturesEnabled: false,
      entitlements: [],
      uiCustomization: null,
      isLangfuseCloud: false,
      hasActiveCloudIncident: false,
      forceV3Experience: false,
    };

    expect(applyNavigationFilters([route], context, organization)).toEqual(
      visible ? [route] : [],
    );
  },
);

it("shows the AI Gateway pages among the organization routes", () => {
  const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "DEV" });
  onTestFinished(() => {
    Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: originalRegion });
  });
  const session = createSession({
    user: { featureFlags: testFeatureFlags({}) },
    organizations: [
      {
        id: "org-1",
        role: "OWNER",
        featureFlags: testFeatureFlags({ aiGateway: true }),
      },
    ],
    environment: { aiGatewayDeployed: true },
  });
  const organization = session.user.organizations[0]!;
  const context: NavigationFilterContext = {
    routerProjectId: undefined,
    routerOrganizationId: "org-1",
    session,
    enableExperimentalFeatures: false,
    internalFeaturesEnabled: false,
    entitlements: [],
    uiCustomization: null,
    isLangfuseCloud: false,
    hasActiveCloudIncident: false,
    forceV3Experience: false,
  };

  expect(
    applyNavigationFilters(ROUTES, context, organization)
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
    "Budgets",
    "Gateway keys",
    "Tracing",
    "Settings",
  ]);
});
