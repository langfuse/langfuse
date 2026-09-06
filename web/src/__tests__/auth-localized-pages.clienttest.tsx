import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { getMessages } from "@/src/features/i18n/messages";
import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";
import SignUp from "@/src/pages/auth/sign-up";
import SSOInitiate from "@/src/pages/auth/sso-initiate";
import type { PageProps } from "@/src/pages/auth/sign-in";
import type { AppLocale } from "@/src/features/i18n/config";

const { fetchMock, routerState, signInMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  routerState: {
    asPath: "/auth/sign-up",
    locale: "zh-CN" as AppLocale,
    query: {} as Record<string, string>,
  },
  signInMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: routerState.asPath,
    pathname: routerState.asPath,
    query: routerState.query,
    locale: routerState.locale,
    isReady: true,
    push: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: false,
    region: undefined,
  }),
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  isAnySsoConfigured: async () => false,
}));

vi.mock("@/src/features/auth/components/AuthCloudRegionSwitch", () => ({
  CloudRegionSwitch: () => null,
}));

vi.mock("@/src/features/auth/components/AuthCloudPrivacyNotice", () => ({
  CloudPrivacyNotice: () => null,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    credentials: {
      resetPassword: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
  },
}));

const authProviders: PageProps["authProviders"] = {
  credentials: true,
  google: false,
  github: false,
  githubEnterprise: false,
  gitlab: false,
  okta: false,
  authentik: false,
  onelogin: false,
  azureAd: false,
  auth0: false,
  clickhouseCloud: false,
  cognito: false,
  keycloak: false,
  workos: false,
  wordpress: false,
  custom: false,
  sso: false,
};

const renderChinese = (children: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="zh-CN" messages={getMessages("zh-CN")}>
      {children}
    </NextIntlClientProvider>,
  );

describe("localized authentication pages", () => {
  beforeEach(() => {
    routerState.locale = "zh-CN";
    routerState.query = {};
    signInMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders registration and validation labels in Chinese", () => {
    routerState.asPath = "/auth/sign-up";
    renderChinese(
      <SignUp
        authProviders={authProviders}
        signUpDisabled={false}
        runningOnHuggingFaceSpaces={false}
        emailVerificationRequired={false}
      />,
    );

    expect(screen.getByText("创建新账户")).toBeInTheDocument();
    expect(screen.getByLabelText("姓名")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("jsdoe@example.com"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "语言" })).toBeInTheDocument();
  });

  it("renders the password reset request in Chinese", () => {
    routerState.asPath = "/auth/reset-password";
    renderChinese(<ResetPasswordPage passwordResetAvailable />);

    expect(screen.getByText("重置你的密码")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("jsdoe@example.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "申请重置密码" }),
    ).toBeInTheDocument();
    expect(screen.getByText("返回登录")).toBeInTheDocument();
  });

  it("does not restart SSO sign-in when the locale changes", async () => {
    routerState.asPath = "/auth/sso-initiate";
    routerState.query = { provider: "enterprise-sso" };
    signInMock.mockReturnValue(new Promise(() => undefined));

    const { rerender } = renderChinese(<SSOInitiate />);

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));

    routerState.locale = "en";
    rerender(
      <NextIntlClientProvider locale="en" messages={getMessages("en")}>
        <SSOInitiate />
      </NextIntlClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Redirecting to your identity provider/),
      ).toBeVisible(),
    );
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  it("localizes a known signup eligibility error", async () => {
    routerState.asPath = "/auth/sign-up";
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        code: "SIGNUP_DISABLED",
        message: "Sign up is disabled.",
      }),
    });
    renderChinese(
      <SignUp
        authProviders={authProviders}
        signUpDisabled={false}
        runningOnHuggingFaceSpaces={false}
        emailVerificationRequired={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "张三" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "zhangsan@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "P@ssw0rd!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByText("此实例已禁用注册。")).toBeInTheDocument();
  });

  it("localizes an existing account error in verified signup", async () => {
    routerState.asPath = "/auth/sign-up";
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        code: "ACCOUNT_EXISTS",
        message: "User with email already exists. Please sign in.",
      }),
    });
    renderChinese(
      <SignUp
        authProviders={authProviders}
        signUpDisabled={false}
        runningOnHuggingFaceSpaces={false}
        emailVerificationRequired
      />,
    );

    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "张三" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "zhangsan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "继续" }));

    expect(
      await screen.findByText("此邮箱已有账户，请直接登录。"),
    ).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("does not expose an unknown signup API message", async () => {
    routerState.asPath = "/auth/sign-up";
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: "database connection details" }),
    });
    renderChinese(
      <SignUp
        authProviders={authProviders}
        signUpDisabled={false}
        runningOnHuggingFaceSpaces={false}
        emailVerificationRequired={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "张三" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "zhangsan@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "P@ssw0rd!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByText("发生错误，请重试。")).toBeInTheDocument();
    expect(screen.queryByText("database connection details")).toBeNull();
  });
});
