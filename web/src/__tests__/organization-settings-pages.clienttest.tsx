import { renderHook } from "@testing-library/react";

import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { useOrganizationSettingsPages } from "@/src/pages/organization/[organizationId]/settings";

vi.mock("@/src/components/PagedSettingsContainer", () => ({
  PagedSettingsContainer: () => null,
}));

vi.mock("@/src/components/layouts/header", () => ({
  default: () => null,
}));

vi.mock("@/src/features/rbac/components/MembershipInvitesPage", () => ({
  MembershipInvitesPage: () => null,
}));

vi.mock("@/src/features/rbac/components/MembersTable", () => ({
  MembersTable: () => null,
}));

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
  "@/src/features/organizations/components/DeleteOrganizationButton",
  () => ({
    DeleteOrganizationButton: () => null,
  }),
);

vi.mock("@/src/ee/features/billing/components/BillingSettings", () => ({
  BillingSettings: () => null,
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: vi.fn(),
  usePlan: vi.fn(),
}));

vi.mock("@/src/ee/features/sso-settings/components/SSOSettings", () => ({
  SSOSettings: () => null,
}));

vi.mock("@langfuse/shared", () => ({
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

vi.mock("@/src/components/layouts/container-page", () => ({
  default: () => null,
}));

const organization = {
  id: "org-1",
  name: "Org 1",
  metadata: {},
};

describe("useOrganizationSettingsPages", () => {
  beforeEach(() => {
    vi.mocked(useQueryProjectOrOrganization).mockReturnValue({
      organization,
    } as ReturnType<typeof useQueryProjectOrOrganization>);
    vi.mocked(useHasEntitlement).mockImplementation(
      (entitlement) => entitlement === "admin-api",
    );
    vi.mocked(useHasOrganizationAccess).mockReturnValue(false);
    vi.mocked(usePlan).mockReturnValue("oss");
    vi.mocked(useIsCloudBillingAvailable).mockReturnValue(false);
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
});
