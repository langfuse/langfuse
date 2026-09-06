import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { DEFAULT_TIME_ZONE } from "@/src/features/i18n/config";
import { getMessages } from "@/src/features/i18n/messages";
import { OrganizationProjectOverview } from "@/src/features/organizations/components/ProjectOverview";

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    organizations: [] as Array<{
      id: string;
      name: string;
      plan: string;
      role: string;
      projects: Array<{ id: string; name: string; deletedAt: Date | null }>;
    }>,
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        canCreateOrganizations: true,
        organizations: sessionState.organizations,
      },
    },
  }),
}));

vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParams: () => [{ search: undefined }, vi.fn()],
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: () => true,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => false,
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useAccountV4MigrationData: () => new Map(),
}));

vi.mock("@/src/features/developer-tools/components/AgentToolsBanner", () => ({
  AgentToolsBanner: () => null,
}));

vi.mock("@/src/features/v4-migration/V4MigrationBanner", () => ({
  V4MigrationBanner: () => null,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      lastTraceByProject: {
        useQuery: () => ({ isSuccess: false, data: undefined }),
      },
    },
  },
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({
    headerProps,
    children,
  }: {
    headerProps: {
      title: string;
      help?: { description: string };
      actionButtonsRight?: ReactNode;
    };
    children: ReactNode;
  }) => (
    <main>
      <h1>{headerProps.title}</h1>
      {headerProps.help && <p>{headerProps.help.description}</p>}
      {headerProps.actionButtonsRight}
      {children}
    </main>
  ),
}));

vi.mock("@/src/components/layouts/header", () => ({
  default: ({
    title,
    labelBadge,
    actionButtons,
  }: {
    title: string;
    labelBadge?: string;
    actionButtons?: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {labelBadge && <span>{labelBadge}</span>}
      {actionButtons}
    </section>
  ),
}));

const renderOverview = () =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={getMessages("zh-CN")}
      timeZone={DEFAULT_TIME_ZONE}
    >
      <OrganizationProjectOverview />
    </NextIntlClientProvider>,
  );

describe("project overview localization", () => {
  beforeEach(() => {
    sessionState.organizations = [];
  });

  it("localizes the no-organization onboarding", () => {
    renderOverview();

    expect(screen.getByRole("heading", { name: "组织" })).toBeVisible();
    expect(screen.getByText("开始使用")).toBeVisible();
    expect(screen.getAllByText("新建组织")).toHaveLength(2);
    expect(screen.getByText("文档")).toBeVisible();
  });

  it("shows a localized empty state when an organization has no projects", () => {
    sessionState.organizations = [
      {
        id: "org-1",
        name: "Acme",
        plan: "oss",
        role: "OWNER",
        projects: [],
      },
    ];

    renderOverview();

    expect(screen.getByText("此组织还没有项目。")).toBeVisible();
    expect(screen.getByText("新建项目")).toBeVisible();
  });

  it("localizes project card actions", () => {
    sessionState.organizations = [
      {
        id: "org-1",
        name: "Acme",
        plan: "oss",
        role: "OWNER",
        projects: [
          {
            id: "project-1",
            name: "Production",
            deletedAt: null,
          },
        ],
      },
    ];

    renderOverview();

    expect(screen.getByText("进入项目")).toBeVisible();
    expect(screen.getByRole("link", { name: "进入项目" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "前往项目 Production 的设置" }),
    ).toBeVisible();
  });
});
