import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import type { Route } from "@/src/components/layouts/routes";
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

it("keeps Custom UI hidden without both platform-admin access and explicit opt-in", () => {
  const featureFlag = "customUi";
  const route: Route = {
    title: "Custom UI",
    href: "/visualizations",
    featureFlag,
  };
  const context: NavigationFilterContext = {
    routerProjectId: undefined,
    routerOrganizationId: undefined,
    session: {
      user: {
        admin: false,
        featureFlags: testFeatureFlags({
          langfuseTopics: false,
          customUi: false,
        }),
      },
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
  context.session!.user!.featureFlags[featureFlag] = true;
  expect(applyNavigationFilters([route], context, undefined)).toEqual([]);
  context.session!.user!.admin = true;
  expect(applyNavigationFilters([route], context, undefined)).toEqual([route]);
});
