import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { CommandMenu } from "@/src/features/command-k-menu/CommandMenu";
import { getMessages } from "@/src/features/i18n/messages";

vi.mock("@/src/components/ui/command", () => ({
  CommandDialog: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({
    heading,
    children,
  }: {
    heading: string;
    children: ReactNode;
  }) => (
    <section>
      <h2>{heading}</h2>
      {children}
    </section>
  ),
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder: string;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
  CommandItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    route: "/",
    asPath: "/",
    push: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        organizations: [
          {
            id: "org-1",
            name: "Acme",
            projects: [{ id: "project-1", name: "Production" }],
          },
        ],
      },
    },
  }),
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/hooks/useDebounce", () => ({
  useDebounce: (callback: (value: string) => void) => callback,
}));
vi.mock("@/src/features/command-k-menu/CommandMenuProvider", () => ({
  useCommandMenu: () => ({ open: true, setOpen: vi.fn() }),
}));
vi.mock("@/src/pages/project/[projectId]/settings", () => ({
  useProjectSettingsPages: () => [
    { title: "通用", slug: "index", content: null },
  ],
}));
vi.mock("@/src/pages/organization/[organizationId]/settings", () => ({
  useOrganizationSettingsPages: () => [
    { title: "通用", slug: "index", content: null },
  ],
}));
vi.mock("@/src/pages/account/settings", () => ({
  useAccountSettingsPages: () => [],
}));
vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    project: { id: "project-1" },
    organization: { id: "org-1" },
  }),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    dashboard: {
      allDashboards: { useQuery: () => ({ data: { dashboards: [] } }) },
    },
  },
}));
vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ isBetaEnabled: false }),
}));

describe("command menu localization", () => {
  it("localizes navigation groups, empty state, and ID lookup", () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={getMessages("zh-CN")}>
        <CommandMenu
          mainNavigation={[
            {
              title: "首页",
              titleKey: "home",
              pathname: "/",
              url: "/",
              isActive: false,
            },
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByPlaceholderText("输入命令或搜索...")).toBeVisible();
    expect(screen.getByText("未找到结果。")).toBeVisible();
    expect(screen.getByRole("heading", { name: "主导航" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "项目" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "项目设置" })).toBeVisible();
    expect(screen.getByText("项目设置 > 通用")).toBeVisible();
    expect(screen.getByRole("heading", { name: "组织设置" })).toBeVisible();
    expect(screen.getByText("组织设置 > 通用")).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText("输入命令或搜索..."), {
      target: { value: "a".repeat(32) },
    });

    expect(screen.getByRole("heading", { name: "追踪" })).toBeVisible();
    expect(screen.getByText("按 ID 查找追踪")).toBeVisible();
  });
});
