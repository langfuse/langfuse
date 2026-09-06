import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SignIn, { type PageProps } from "@/src/pages/auth/sign-in";

const { captureExceptionMock, addBreadcrumbMock, signInMock, routerState } =
  vi.hoisted(() => ({
    captureExceptionMock: vi.fn(),
    addBreadcrumbMock: vi.fn(),
    signInMock: vi.fn(),
    routerState: { query: {} as Record<string, string> },
  }));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: addBreadcrumbMock,
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/auth/sign-in",
    query: routerState.query,
    push: vi.fn(),
    replace: vi.fn(),
  }),
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
  jumpcloud: false,
  keycloak: false,
  workos: false,
  wordpress: false,
  custom: false,
  sso: false,
};

const renderSignIn = (
  props: Partial<PageProps> & {
    authProviders?: PageProps["authProviders"];
  } = {},
) =>
  render(
    <SignIn
      authProviders={authProviders}
      signUpDisabled={false}
      runningOnHuggingFaceSpaces={false}
      emailVerificationRequired={false}
      {...props}
    />,
  );

describe("sign-in page NextAuth error classification", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    signInMock.mockReset();
    routerState.query = {};
    window.localStorage.clear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("breadcrumbs an allowlisted code (OAuthCallback) instead of capturing", () => {
    routerState.query = { error: "OAuthCallback" };
    renderSignIn();

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    const crumb = addBreadcrumbMock.mock.calls[0]![0];
    expect(crumb.category).toBe("auth.signIn");
    expect(crumb.data).toEqual({ code: "OAuthCallback" });
  });

  it("breadcrumbs a mapped code (OAuthAccountNotLinked) instead of capturing", () => {
    routerState.query = { error: "OAuthAccountNotLinked" };
    renderSignIn();

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  it("breadcrumbs an IdP-described error instead of capturing", () => {
    routerState.query = {
      error: "some_idp_error",
      error_description: "User did not grant access",
    };
    renderSignIn();

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  // Negative fixtures: codes outside the allowlist are real errors.
  it.each(["OAuthSignin", "Configuration", "SomeUnknownCode"])(
    "still captures %j",
    (error) => {
      routerState.query = { error };
      renderSignIn();

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const [err, options] = captureExceptionMock.mock.calls[0]!;
      expect(err.message).toBe(`Sign in error: ${error}`);
      expect(options.tags.area).toBe("auth.signIn");
      expect(addBreadcrumbMock).not.toHaveBeenCalled();
    },
  );

  const submitCredentials = () => {
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("submit-email-password-sign-in-form"));
  };

  it("treats an undefined signIn() result as an expected transport blip", async () => {
    signInMock.mockResolvedValue(undefined);
    renderSignIn();
    submitCredentials();

    await waitFor(() => {
      expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    });
    expect(addBreadcrumbMock.mock.calls[0]![0].category).toBe(
      "auth.signIn.credentials",
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/An unexpected error occurred/),
    ).toBeInTheDocument();
  });

  it("treats next-auth's missing data.url TypeError as expected", async () => {
    signInMock.mockRejectedValue(
      new TypeError("URL constructor: undefined is not a valid URL."),
    );
    renderSignIn();
    submitCredentials();

    await waitFor(() => {
      expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    });
    expect(addBreadcrumbMock.mock.calls[0]![0].category).toBe(
      "auth.signIn.credentials",
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/An unexpected error occurred/),
    ).toBeInTheDocument();
  });

  it("still captures an unknown TypeError from signIn()", async () => {
    signInMock.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'ok')"),
    );
    renderSignIn();
    submitCredentials();

    await waitFor(() => {
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });
    expect(captureExceptionMock.mock.calls[0]![1].tags.area).toBe(
      "auth.signIn.credentials",
    );
    expect(addBreadcrumbMock).not.toHaveBeenCalled();
  });

  it("renders without crashing when props are missing (fallback providers)", () => {
    renderSignIn({
      authProviders: undefined as unknown as PageProps["authProviders"],
    });

    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});

describe("sign-in page JumpCloud provider button", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue(undefined);
    routerState.query = {};
    window.localStorage.clear();
  });

  it("does not render a JumpCloud button when the provider is disabled", () => {
    renderSignIn();

    expect(
      screen.queryByRole("button", { name: /JumpCloud/ }),
    ).not.toBeInTheDocument();
  });

  it("renders a JumpCloud button and signs in with the jumpcloud provider", () => {
    renderSignIn({
      authProviders: {
        ...authProviders,
        jumpcloud: true,
      },
    });

    const button = screen.getByRole("button", { name: /JumpCloud/ });
    fireEvent.click(button);

    expect(signInMock).toHaveBeenCalledWith("jumpcloud");
  });

  it("still renders JumpCloud when username/password auth is disabled", () => {
    renderSignIn({
      authProviders: {
        ...authProviders,
        credentials: false,
        jumpcloud: true,
      },
    });

    expect(
      screen.getByRole("button", { name: /JumpCloud/ }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
});
