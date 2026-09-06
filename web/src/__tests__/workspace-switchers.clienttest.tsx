import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "@/src/components/ProjectDropdownMenu/ProjectDropdownMenu";
import { DEFAULT_TIME_ZONE } from "@/src/features/i18n/config";
import { getMessages } from "@/src/features/i18n/messages";

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenuContent: ({
    header,
    children,
  }: {
    header: string;
    children: ReactNode;
  }) => (
    <section>
      <h2>{header}</h2>
      {children}
    </section>
  ),
  DropdownMenuItemWithSecondaryAction: ({
    title,
    secondaryAction,
  }: {
    title: string;
    secondaryAction?: { ariaLabel: string };
  }) => (
    <div>
      <span>{title}</span>
      {secondaryAction && (
        <button aria-label={secondaryAction.ariaLabel}>settings</button>
      )}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuLoadingItem: () => <span>loading</span>,
}));

const renderChinese = (children: ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={getMessages("zh-CN")}
      timeZone={DEFAULT_TIME_ZONE}
    >
      {children}
    </NextIntlClientProvider>,
  );

describe("workspace switcher localization", () => {
  it("localizes the organization switcher", () => {
    renderChinese(
      <OrganizationDropdownMenu
        state="loaded"
        organizations={[
          {
            id: "org-1",
            name: "Acme",
            plan: "oss",
            role: "OWNER",
            projects: [],
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: true,
            aiTelemetryEnabled: true,
          },
        ]}
        canCreateOrganizations
        getOrgPath={(organizationId) => `/organization/${organizationId}`}
      />,
    );

    expect(screen.getByRole("heading", { name: "组织" })).toBeVisible();
    expect(screen.getByText("新建组织")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "前往 Acme 的设置" }),
    ).toBeVisible();
  });

  it("localizes the project switcher", () => {
    renderChinese(
      <ProjectDropdownMenu
        state="loaded"
        projects={[
          {
            id: "project-1",
            name: "Production",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            role: "OWNER",
            createdAt: "2026-09-05T00:00:00.000Z",
          },
        ]}
        organizationId="org-1"
        canCreateProjects
        getProjectPath={(projectId) => `/project/${projectId}`}
      />,
    );

    expect(screen.getByRole("heading", { name: "项目" })).toBeVisible();
    expect(screen.getByText("新建项目")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "前往 Production 的设置" }),
    ).toBeVisible();
  });
});
