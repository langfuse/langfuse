import { renderHook } from "@testing-library/react";

import { useHasEntitlement, usePlan } from "@/src/entitlements";
import { useIsFeatureEnabled } from "@/src/release-management/feature-flags";
import { useQueryProjectOrOrganization } from "@/src/identity/projects";
import { useHasOrganizationAccess } from "@/src/identity/access-control";
import { useIsCloudBillingAvailable } from "@/src/ee/billing";
import { useV4UpgradeUiFlag } from "@/src/migrations/v4/upgrade-experience/useV4UpgradeUiEnabled";
import { useOrganizationSettingsPages } from "@/src/identity/organizations/OrganizationSettingsPage";

vi.mock("@/src/app/components/PagedSettingsContainer", () => ({
  PagedSettingsContainer: () => null,
}));

vi.mock("@/src/app/shell/layouts/header", () => ({
  default: () => null,
}));

vi.mock(
  "@/src/identity/access-control/components/MembershipInvitesSettingsTable/ConnectedMembershipInvitesSettingsTable",
  () => ({
    ConnectedMembershipInvitesSettingsTable: () => null,
  }),
);

vi.mock(
  "@/src/identity/access-control/components/MembersSettingsTable/ConnectedMembersSettingsTable",
  () => ({ ConnectedMembersSettingsTable: () => null }),
);

vi.mock("@/src/app/design-system/legacy-primitives/CodeJsonViewer", () => ({
  JSONView: () => null,
}));

vi.mock("@/src/identity/organizations/components/RenameOrganization", () => ({
  default: () => null,
}));

vi.mock("@/src/app/components/SettingsDangerZone", () => ({
  SettingsDangerZone: () => null,
}));

vi.mock(
  "@/src/identity/organizations/components/DeleteOrganizationDialogController",
  () => ({
    DeleteOrganizationDialogController: () => null,
  }),
);

vi.mock("@/src/ee/billing/components/BillingSettings", () => ({
  BillingSettings: () => null,
}));

vi.mock("@/src/billing/usage", () => ({
  OrganizationUsageBreakdown: () => null,
}));

vi.mock("@/src/entitlements/hooks", () => ({
  useHasEntitlement: vi.fn(),
  usePlan: vi.fn(),
}));

vi.mock("@/src/ee/identity/auth/sso-settings", () => ({
  SSOSettings: () => null,
}));

vi.mock("@langfuse/shared", async () => ({
  ...(await vi.importActual("@langfuse/shared")),
  isCloudPlan: vi.fn(() => false),
}));

vi.mock("@/src/identity/projects/hooks", () => ({
  useQueryProjectOrOrganization: vi.fn(),
}));

vi.mock("@/src/public-api/components/ApiKeyList", () => ({
  ApiKeyList: () => null,
}));

vi.mock("@/src/identity/organizations/components/AIFeatureSwitch", () => ({
  default: () => null,
}));

vi.mock("@/src/ee/billing/utils/isCloudBilling", () => ({
  useIsCloudBillingAvailable: vi.fn(),
}));

vi.mock("@/src/ee/identity/audit-logs/viewer", () => ({
  OrgAuditLogsSettingsPage: () => null,
}));

vi.mock("@/src/identity/access-control/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: vi.fn(),
}));

vi.mock("@/src/app/shell/layouts/container-page", () => ({
  default: () => null,
}));

vi.mock("@/src/migrations/v4/upgrade-experience/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiFlag: vi.fn(),
}));

vi.mock(
  "@/src/release-management/feature-flags/hooks/useIsFeatureEnabled",
  () => ({
    default: vi.fn(),
  }),
);

vi.mock("@/src/ai/gateway/management-ui", () => ({
  GatewayApiKeysPage: () => null,
  GatewayConfigurationPage: () => null,
  GatewayModelsPage: () => null,
  GatewayProvidersPage: () => null,
}));

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

  it("hides all AI Gateway settings without gateway management access", () => {
    const { result } = renderHook(() => useOrganizationSettingsPages());

    expect(useHasOrganizationAccess).toHaveBeenCalledWith({
      organizationId: "org-1",
      scope: "gateway:manage",
    });
    expect(
      result.current
        .filter((page) => page.slug.startsWith("ai-gateway"))
        .every((page) => page.show === false),
    ).toBe(true);
  });

  it("hides all AI Gateway settings when the internal flag is disabled", () => {
    vi.mocked(useHasOrganizationAccess).mockImplementation(
      ({ scope }) => scope === "gateway:manage",
    );

    const { result } = renderHook(() => useOrganizationSettingsPages());
    const gatewayPages = result.current.filter((page) =>
      page.slug.startsWith("ai-gateway"),
    );

    expect(gatewayPages.every((page) => page.show === false)).toBe(true);
  });

  it("shows all AI Gateway settings when the internal flag and gateway management access are enabled", () => {
    vi.mocked(useHasOrganizationAccess).mockImplementation(
      ({ scope }) => scope === "gateway:manage",
    );
    vi.mocked(useIsFeatureEnabled).mockReturnValue(true);

    const { result } = renderHook(() => useOrganizationSettingsPages());
    const gatewayPages = result.current.filter((page) =>
      page.slug.startsWith("ai-gateway"),
    );

    expect(gatewayPages.map((page) => page.slug)).toEqual([
      "ai-gateway",
      "ai-gateway-providers",
      "ai-gateway-models",
      "ai-gateway-api-keys",
    ]);
    expect(gatewayPages.every((page) => page.show === true)).toBe(true);
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
      ({ scope }) => scope === "organizationUsage:read",
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
});
