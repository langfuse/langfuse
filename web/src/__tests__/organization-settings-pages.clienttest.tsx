import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";

import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useOrganizationSettingsPages } from "@/src/features/organizations/OrganizationSettingsPage";
import { isCloudPlan } from "@langfuse/shared";
import { organizationRoleAccessRights } from "@langfuse/shared/rbac";
import { Role } from "@langfuse/shared/src/db";

vi.mock("@/src/components/PagedSettingsContainer", () => ({
  PagedSettingsContainer: () => null,
}));

vi.mock("@/src/components/layouts/header", () => ({
  default: () => null,
}));

vi.mock(
  "@/src/features/rbac/components/MembershipInvitesSettingsTable/ConnectedMembershipInvitesSettingsTable",
  () => ({
    ConnectedMembershipInvitesSettingsTable: () => null,
  }),
);

vi.mock(
  "@/src/features/rbac/components/MembersSettingsTable/ConnectedMembersSettingsTable",
  () => ({ ConnectedMembersSettingsTable: () => null }),
);

vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  JSONView: () => null,
}));

vi.mock("@/src/features/organizations/components/RenameOrganization", () => ({
  default: () => null,
}));

vi.mock("@/src/components/SettingsDangerZone", () => ({
  SettingsDangerZone: () => null,
}));

vi.mock(
  "@/src/features/organizations/components/DeleteOrganizationDialogController",
  () => ({
    DeleteOrganizationDialogController: () => null,
  }),
);

vi.mock("@/src/ee/features/billing/components/BillingSettings", () => ({
  BillingSettings: () => null,
}));

vi.mock(
  "@/src/features/organization-usage/components/OrganizationUsageBreakdown",
  () => ({
    OrganizationUsageBreakdown: () => null,
  }),
);

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: vi.fn(),
  usePlan: vi.fn(),
}));

vi.mock("@/src/ee/features/sso-settings/components/SSOSettings", () => ({
  SSOSettings: () => null,
}));

vi.mock("@langfuse/shared", async () => ({
  ...(await vi.importActual("@langfuse/shared")),
  isCloudPlan: vi.fn(() => false),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: vi.fn(),
}));

vi.mock("@/src/features/public-api/components/ApiKeyList", () => ({
  ApiKeyList: () => null,
}));

vi.mock("@/src/features/organizations/components/AIFeatureSwitch", () => ({
  default: () => null,
}));

vi.mock("@/src/ee/features/billing/utils/isCloudBilling", () => ({
  useIsCloudBillingAvailable: vi.fn(),
}));

vi.mock("@/src/ee/features/audit-log-viewer/OrgAuditLogsSettingsPage", () => ({
  OrgAuditLogsSettingsPage: () => null,
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: vi.fn(),
}));

vi.mock("@/src/components/layouts/ContainerPage", () => ({
  default: () => null,
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiFlag: vi.fn(),
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

const organization = {
  id: "org-1",
  name: "Org 1",
  metadata: {},
  projects: [],
};

describe("useOrganizationSettingsPages", () => {
  beforeEach(() => {
    vi.mocked(useQueryProjectOrOrganization).mockReturnValue({
      organization,
      project: null,
    } as unknown as ReturnType<typeof useQueryProjectOrOrganization>);
    vi.mocked(useHasEntitlement).mockImplementation(
      (entitlement) => entitlement === "admin-api",
    );
    vi.mocked(useHasOrganizationAccess).mockReturnValue(false);
    vi.mocked(usePlan).mockReturnValue("oss");
    vi.mocked(useIsCloudBillingAvailable).mockReturnValue(false);
    vi.mocked(useV4UpgradeUiFlag).mockReturnValue(false);
    vi.mocked(useIsFeatureEnabled).mockReturnValue(false);
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    });
  });

  it("hides organization API key settings without organization api key access", () => {
    const { result } = renderHook(() => useOrganizationSettingsPages());

    expect(useHasOrganizationAccess).toHaveBeenCalledWith({
      organizationId: "org-1",
      scope: "organization:CRUD_apiKeys",
    });
    expect(result.current.find((page) => page.slug === "api-keys")?.show).toBe(
      false,
    );
  });

  it("shows organization API key settings with entitlement and access", () => {
    vi.mocked(useHasOrganizationAccess).mockReturnValue(true);

    const { result } = renderHook(() => useOrganizationSettingsPages());

    expect(result.current.find((page) => page.slug === "api-keys")?.show).toBe(
      true,
    );
  });

  it("hides organization API key settings without admin-api entitlement", () => {
    vi.mocked(useHasEntitlement).mockImplementation(() => false);
    vi.mocked(useHasOrganizationAccess).mockReturnValue(true);

    const { result } = renderHook(() => useOrganizationSettingsPages());

    expect(result.current.find((page) => page.slug === "api-keys")?.show).toBe(
      false,
    );
  });

  it("gates the v4 migration link on deployment availability", () => {
    vi.mocked(useHasOrganizationAccess).mockImplementation(
      ({ scope }) => scope === "organizationSettings:read",
    );
    const { result } = renderHook(() => useOrganizationSettingsPages());

    expect(
      result.current.find((page) => page.slug === "v4-migration")?.show,
    ).toBe(false);

    vi.mocked(useV4UpgradeUiFlag).mockReturnValue(true);

    const { result: enabled } = renderHook(() =>
      useOrganizationSettingsPages(),
    );

    expect(
      enabled.current.find((page) => page.slug === "v4-migration")?.show,
    ).toBe(true);
  });

  it("shows the usage page instead of the billing page without cloud billing", () => {
    vi.mocked(useHasOrganizationAccess).mockImplementation(
      ({ scope }) => scope === "organizationUsage:read",
    );

    const { result } = renderHook(() => useOrganizationSettingsPages());
    const show = (slug: string) =>
      result.current.find((page) => page.slug === slug)?.show;

    expect(show("usage")).toBe(true);
    expect(show("billing")).toBe(false);
  });

  it("hides the usage page on cloud, where the billing page embeds the breakdown", () => {
    vi.mocked(useHasOrganizationAccess).mockImplementation(
      ({ scope }) =>
        scope === "organizationUsage:read" ||
        scope === "organizationSettings:read",
    );
    vi.mocked(useHasEntitlement).mockImplementation(
      (entitlement) => entitlement === "cloud-billing",
    );
    vi.mocked(useIsCloudBillingAvailable).mockReturnValue(true);

    const { result } = renderHook(() => useOrganizationSettingsPages());
    const show = (slug: string) =>
      result.current.find((page) => page.slug === slug)?.show;

    expect(show("usage")).toBe(false);
    expect(show("billing")).toBe(true);
  });

  it("hides the usage page without usage access", () => {
    const { result } = renderHook(() => useOrganizationSettingsPages());

    expect(useHasOrganizationAccess).toHaveBeenCalledWith({
      organizationId: "org-1",
      scope: "organizationUsage:read",
    });
    expect(result.current.find((page) => page.slug === "usage")?.show).toBe(
      false,
    );
  });

  describe("visible pages by role", () => {
    beforeEach(() => {
      vi.mocked(useHasEntitlement).mockReturnValue(true);
      vi.mocked(useIsCloudBillingAvailable).mockReturnValue(true);
      vi.mocked(useV4UpgradeUiFlag).mockReturnValue(true);
      vi.mocked(useIsFeatureEnabled).mockReturnValue(true);
      vi.mocked(isCloudPlan).mockReturnValue(true);
    });

    afterEach(() => {
      vi.mocked(isCloudPlan).mockReturnValue(false);
    });

    it("shows Projects to AI_GATEWAY members with a project", () => {
      grantScopesOf(Role.AI_GATEWAY);
      vi.mocked(useQueryProjectOrOrganization).mockReturnValue({
        organization: {
          ...organization,
          projects: [{ id: "project-1", name: "Project 1" }],
        },
        project: null,
      } as unknown as ReturnType<typeof useQueryProjectOrOrganization>);

      expect(visibleSlugs()).toEqual(["projects"]);
    });

    it("shows NONE members the organization overview pages", () => {
      grantScopesOf(Role.NONE);

      expect(visibleSlugs()).toEqual([
        "index",
        "members",
        "audit-logs",
        "billing",
        "sso",
        "projects",
        "v4-migration",
      ]);
    });

    it("shows VIEWER members the organization overview pages", () => {
      grantScopesOf(Role.VIEWER);

      expect(visibleSlugs()).toEqual([
        "index",
        "members",
        "audit-logs",
        "billing",
        "sso",
        "projects",
        "v4-migration",
      ]);
    });
  });
});

function grantScopesOf(role: Role) {
  vi.mocked(useHasOrganizationAccess).mockImplementation(({ scope }) =>
    organizationRoleAccessRights[role].includes(scope),
  );
}

function visibleSlugs() {
  const { result } = renderHook(() => useOrganizationSettingsPages());
  return result.current.filter((page) => page.show ?? true).map((p) => p.slug);
}
