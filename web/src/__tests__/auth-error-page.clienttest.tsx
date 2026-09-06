import { render, screen } from "@testing-library/react";

import AuthError from "@/src/pages/auth/error";
import { MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE } from "@/src/features/auth/constants";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@/src/features/i18n/messages";
import type { AppLocale } from "@/src/features/i18n/config";

const { captureExceptionMock, addBreadcrumbMock, routerState } = vi.hoisted(
  () => ({
    captureExceptionMock: vi.fn(),
    addBreadcrumbMock: vi.fn(),
    routerState: {
      query: {} as Record<string, string>,
      locale: "en" as AppLocale,
    },
  }),
);

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: addBreadcrumbMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/auth/error",
    pathname: "/auth/error",
    locale: routerState.locale,
    query: routerState.query,
    push: vi.fn(),
  }),
}));

describe("/auth/error Sentry classification", () => {
  const renderAuthError = () =>
    render(
      <NextIntlClientProvider
        locale={routerState.locale}
        messages={getMessages(routerState.locale)}
      >
        <AuthError />
      </NextIntlClientProvider>,
    );

  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    routerState.query = {};
    routerState.locale = "en";
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("does not capture an expired/used magic link (Verification)", () => {
    routerState.query = { error: "Verification" };
    renderAuthError();

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  it("does not capture the deliberate SSO domain rejection", () => {
    routerState.query = { error: MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE };
    renderAuthError();

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  // Negative fixtures: a genuine auth-system failure still captures.
  it.each(["Configuration", "AccessDenied", "Unknown provider explosion"])(
    "still captures %j",
    (error) => {
      routerState.query = { error };
      renderAuthError();

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const [err, options] = captureExceptionMock.mock.calls[0]!;
      expect(err.message).toBe(
        `ErrorPageWithSentry rendered: Authentication Error, ${error}`,
      );
      expect(options.tags.area).toBe("error-page");
    },
  );

  it("still captures when no error param is present (unknown state)", () => {
    renderAuthError();

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("shows a localized fallback without changing the raw Sentry error", () => {
    routerState.locale = "zh-CN";
    routerState.query = { error: "Configuration" };
    renderAuthError();

    expect(screen.getByText("认证错误")).toBeInTheDocument();
    expect(
      screen.getByText("认证过程中发生错误，请联系支持团队。"),
    ).toBeInTheDocument();
    expect(captureExceptionMock.mock.calls[0]![0].message).toContain(
      "Configuration",
    );
  });
});
