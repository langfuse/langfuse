import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { DEFAULT_TIME_ZONE } from "@/src/features/i18n/config";
import { getMessages } from "@/src/features/i18n/messages";
import { NewOrganizationForm } from "@/src/features/organizations/components/NewOrganizationForm";
import { NewProjectForm } from "@/src/features/projects/components/NewProjectForm";
import { SetupPage } from "@/src/features/setup/components/SetupPage";

const { createProjectMock } = vi.hoisted(() => ({
  createProjectMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn(), reload: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { organizations: [] } },
    update: vi.fn(),
  }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({ organization: undefined }),
  useOrgProjectSwitchPaths: () => ({
    getProjectPath: vi.fn(),
    getOrgPath: vi.fn(),
  }),
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true }),
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: () => false,
}));

vi.mock("@/src/components/design-system/Switch/Switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label": string;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      {...props}
    />
  ),
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({
    headerProps,
    children,
  }: {
    headerProps: {
      title: string;
      help?: { description: string };
      breadcrumb?: { name: string }[];
    };
    children: ReactNode;
  }) => (
    <main>
      <h1>{headerProps.title}</h1>
      {headerProps.help && <p>{headerProps.help.description}</p>}
      {headerProps.breadcrumb?.map((item) => (
        <span key={item.name}>{item.name}</span>
      ))}
      {children}
    </main>
  ),
}));

vi.mock("@/src/components/layouts/header", () => ({
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

vi.mock("@/src/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock("@/src/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
  BreadcrumbItem: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  BreadcrumbList: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  BreadcrumbPage: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  BreadcrumbSeparator: () => <span>/</span>,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      create: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
    projects: {
      create: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: createProjectMock,
        }),
      },
    },
  },
  reportTrpcErrorWithoutToast: vi.fn(),
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

describe("workspace setup localization", () => {
  it("localizes the organization setup step", () => {
    renderChinese(<SetupPage />);

    expect(screen.getByRole("heading", { name: "设置" })).toBeVisible();
    expect(screen.getByText("1. 创建组织")).toBeVisible();
    expect(screen.getByText("2. 创建项目")).toBeVisible();
    expect(screen.getByRole("heading", { name: "新建组织" })).toBeVisible();
  });

  it("localizes organization form labels and validation", async () => {
    renderChinese(<NewOrganizationForm isLangfuseCloud onSubmit={vi.fn()} />);

    expect(screen.getByText("组织名称")).toBeVisible();
    expect(screen.getByText("启用 AI 功能")).toBeVisible();
    expect(screen.getByRole("button", { name: "创建" })).toBeVisible();

    fireEvent.change(screen.getByTestId("new-org-name-input"), {
      target: { value: "ab" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(await screen.findByText("至少需要 3 个字符")).toBeVisible();
  });

  it("localizes project form labels and validation", async () => {
    renderChinese(<NewProjectForm orgId="org-1" onSuccess={vi.fn()} />);

    expect(screen.getByText("项目名称")).toBeVisible();
    expect(screen.getByRole("button", { name: "创建" })).toBeVisible();

    fireEvent.change(screen.getByTestId("new-project-name-input"), {
      target: { value: "ab" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(await screen.findByText("至少需要 3 个字符")).toBeVisible();
  });
});
