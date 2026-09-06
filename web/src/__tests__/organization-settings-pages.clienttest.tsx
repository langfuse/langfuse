import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useOrganizationSettingsPages } from "@/src/pages/organization/[organizationId]/settings";
import { getMessages } from "@/src/features/i18n/messages";

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
  "@/src/features/organizations/components/DeleteOrganizationDialogController",
  () => ({
    DeleteOrganizationDialogController: () => null,
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

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiFlag: vi.fn(),
}));

const organization = {
  id: "org-1",
  name: "Org 1",
  metadata: {},
};

const localeWrapper = (locale: "en" | "zh-CN") =>
  function LocaleWrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </NextIntlClientProvider>
    );
  };

const renderSettingsPages = (locale: "en" | "zh-CN" = "en") =>
  renderHook(() => useOrganizationSettingsPages(), {
    wrapper: localeWrapper(locale),
  });

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
    vi.mocked(useV4UpgradeUiFlag).mockReturnValue(false);
  });

  it("hides organization API key settings without organization api key access", () => {
    const { result } = renderSettingsPages();

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

    const { result } = renderSettingsPages();

    expect(result.current.find((page) => page.slug === "api-keys")?.show).toBe(
      true,
    );
  });

  it("hides organization API key settings without admin-api entitlement", () => {
    vi.mocked(useHasEntitlement).mockImplementation(() => false);
    vi.mocked(useHasOrganizationAccess).mockReturnValue(true);

    const { result } = renderSettingsPages();

    expect(result.current.find((page) => page.slug === "api-keys")?.show).toBe(
      false,
    );
  });

  it("gates the v4 migration link on deployment availability", () => {
    const { result } = renderSettingsPages();

    expect(
      result.current.find((page) => page.slug === "v4-migration")?.show,
    ).toBe(false);

    vi.mocked(useV4UpgradeUiFlag).mockReturnValue(true);

    const { result: enabled } = renderSettingsPages();

    expect(
      enabled.current.find((page) => page.slug === "v4-migration")?.show,
    ).toBe(true);
  });

  it("localizes organization settings page titles", () => {
    const { result } = renderSettingsPages("zh-CN");

    expect(result.current.find((page) => page.slug === "index")?.title).toBe(
      "通用",
    );
    expect(result.current.find((page) => page.slug === "members")?.title).toBe(
      "成员",
    );
    expect(result.current.find((page) => page.slug === "projects")?.title).toBe(
      "项目",
    );
  });
});
