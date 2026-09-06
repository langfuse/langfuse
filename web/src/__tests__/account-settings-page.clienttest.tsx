import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { getMessages } from "@/src/features/i18n/messages";
import AccountSettingsPage from "@/src/pages/account/settings";

const { routerState } = vi.hoisted(() => ({
  routerState: { locale: "en" as "en" | "zh-CN" },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/account/settings",
    pathname: "/account/settings",
    query: {},
    locale: routerState.locale,
    push: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { name: "Jane Doe", email: "jane@example.com" },
    },
    status: "authenticated",
    update: vi.fn(),
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ invalidate: vi.fn() }),
    userAccount: {
      updateDisplayName: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      checkCanDelete: {
        useQuery: () => ({
          data: { canDelete: true, blockingOrganizations: [] },
        }),
      },
      delete: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
  },
  reportNonTrpcError: vi.fn(),
}));

vi.mock("@/src/features/auth/lib/signOut", () => ({
  signOutCleanly: vi.fn(),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: vi.fn(),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiFlag: () => false,
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({
    headerProps,
    children,
  }: {
    headerProps: { title: string };
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{headerProps.title}</h1>
      {children}
    </div>
  ),
}));

const renderPage = (locale: "en" | "zh-CN") => {
  routerState.locale = locale;
  return render(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
      <AccountSettingsPage />
    </NextIntlClientProvider>,
  );
};

describe("account settings localization", () => {
  it("renders the English account settings baseline", () => {
    renderPage("en");

    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByText("Your email address:")).toHaveTextContent(
      "jane@example.com",
    );
    expect(screen.getByText("Display Name")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
  });

  it("renders Chinese content and the localized delete confirmation", () => {
    renderPage("zh-CN");

    expect(screen.getByText("账户设置")).toBeInTheDocument();
    expect(screen.getByText("你的邮箱地址：")).toHaveTextContent(
      "jane@example.com",
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "当前显示名称为“Jane Doe”。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("修改密码")).toBeInTheDocument();
    expect(screen.getByText("危险操作")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除账户" }));

    expect(
      screen.getByText("请输入邮箱地址“jane@example.com”以确认删除"),
    ).toBeInTheDocument();
  });
});
