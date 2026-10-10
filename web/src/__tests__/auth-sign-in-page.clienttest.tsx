import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SignInPage, { type PageProps } from "@/src/features/auth/SignInPage";

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
    <SignInPage
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

describe("sign-in page SSO check transport errors", () => {
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
    vi.unstubAllGlobals();
  });

  it("breadcrumbs a JSON.parse failure on check-sso instead of capturing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>gateway</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    renderSignIn({
      authProviders: { ...authProviders, sso: true },
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(screen.getByTestId("submit-email-password-sign-in-form"));

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to check SSO configuration/),
      ).toBeInTheDocument();
    });
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbMock.mock.calls[0]![0].category).toBe(
      "auth.signIn.checkSso",
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  // Negative fixture: unexpected check-sso failures must still capture.
  it("still captures an unexpected check-sso failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    renderSignIn({
      authProviders: { ...authProviders, sso: true },
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(screen.getByTestId("submit-email-password-sign-in-form"));

    await waitFor(() => {
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });
    const [err, options] = captureExceptionMock.mock.calls[0]!;
    expect(err.message).toBe("boom");
    expect(options.tags.area).toBe("auth.signIn.checkSso");
    expect(addBreadcrumbMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Unable to check SSO configuration/),
    ).toBeInTheDocument();
  });

  // Non-JSON SyntaxErrors must still capture (classifier allowlist only).
  it("still captures a non-JSON SyntaxError from check-sso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new SyntaxError("Invalid regular expression")),
    );

    renderSignIn({
      authProviders: { ...authProviders, sso: true },
    });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(screen.getByTestId("submit-email-password-sign-in-form"));

    await waitFor(() => {
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });
    const [err, options] = captureExceptionMock.mock.calls[0]!;
    expect(err).toBeInstanceOf(SyntaxError);
    expect(err.message).toBe("Invalid regular expression");
    expect(options.tags.area).toBe("auth.signIn.checkSso");
    expect(addBreadcrumbMock).not.toHaveBeenCalled();
  });
});

describe("sign-in page last used SSO email", () => {
  const STORAGE_KEY = "langfuse_last_used_sso_email";
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const storedSsoEmail = () => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as string);
  };

  const ssoCheckReturns = (providerId: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ providerId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

  const ssoCheckFailsWith = (status: number) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "nope" }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

  const continueWithEmail = (email: string) => {
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: email },
    });
    fireEvent.click(screen.getByTestId("submit-email-password-sign-in-form"));
  };

  const renderTwoStepSignIn = () =>
    renderSignIn({ authProviders: { ...authProviders, sso: true } });

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
    vi.unstubAllGlobals();
  });

  it("pre-fills the email input with the remembered SSO address", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("jane@acme.com"));

    renderTwoStepSignIn();

    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toHaveValue("jane@acme.com");
    });
    // Nothing else is revealed: the password step still waits on check-sso.
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
  });

  it("lets an email query param win over the remembered address", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("jane@acme.com"));
    routerState.query = { email: "invited@acme.com" };

    renderTwoStepSignIn();

    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toHaveValue("invited@acme.com");
    });
  });

  it("remembers the address when check-sso redirects to an SSO provider", async () => {
    ssoCheckReturns("acme.com.okta");

    renderTwoStepSignIn();
    continueWithEmail("jane@acme.com");

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("acme.com.okta", undefined);
    });
    expect(storedSsoEmail()).toBe("jane@acme.com");
  });

  it("forgets a remembered address once an email falls back to a password", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("jane@acme.com"));
    ssoCheckFailsWith(404);

    renderTwoStepSignIn();
    continueWithEmail("someone-else@example.com");

    // The password step appearing is what marks the email as not SSO-backed.
    await waitFor(() => {
      expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    });
    expect(storedSsoEmail()).toBe("");
    expect(signInMock).not.toHaveBeenCalled();
  });

  // 404 is the only status that means "this domain has no SSO provider". A
  // server or proxy failure says nothing about the domain, so it must not cost
  // the user an address that was correctly remembered.
  it("keeps the remembered address when check-sso fails with a server error", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("jane@acme.com"));
    ssoCheckFailsWith(500);

    renderTwoStepSignIn();
    continueWithEmail("jane@acme.com");

    await waitFor(() => {
      expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    });
    expect(storedSsoEmail()).toBe("jane@acme.com");
  });

  // An instance that removes its last SSO config renders the one-step password
  // form, which never runs the lookup that would clear a remembered address.
  it("drops a remembered address when the instance has no SSO configured", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("jane@acme.com"));

    renderSignIn({ authProviders: { ...authProviders, sso: false } });

    // One-step form: password is visible immediately.
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    await waitFor(() => {
      expect(storedSsoEmail()).toBe("");
    });
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  // The transport path (fetch rejects) is likewise not a verdict on the domain.
  it("keeps the remembered address when check-sso cannot be reached", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("jane@acme.com"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderTwoStepSignIn();
    continueWithEmail("jane@acme.com");

    await waitFor(() => {
      expect(
        screen.getByText(/Unable to check SSO configuration/),
      ).toBeInTheDocument();
    });
    expect(storedSsoEmail()).toBe("jane@acme.com");
  });
});

// The address is already on screen when "(forgot password?)" is clicked, so the
// reset page should not ask for it a second time (langfuse#18583).
describe("sign-in page forgot-password link", () => {
  beforeEach(() => {
    signInMock.mockReset();
    routerState.query = {};
    window.localStorage.clear();
  });

  const forgotPasswordLink = () =>
    screen.getByRole("link", { name: /forgot password/i });

  it("links to the bare reset page while the email field is empty", () => {
    renderSignIn();

    expect(forgotPasswordLink()).toHaveAttribute(
      "href",
      "/auth/reset-password",
    );
  });

  it("carries the typed address over, percent-encoded", () => {
    renderSignIn();

    // A `+` is legal in an address and decodes back as a space unencoded.
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "  jane+test@example.com  " },
    });

    expect(forgotPasswordLink()).toHaveAttribute(
      "href",
      "/auth/reset-password?email=jane%2Btest%40example.com",
    );
  });

  it("carries over an address restored from the query", () => {
    routerState.query = { email: "jane@example.com" };

    renderSignIn();

    expect(forgotPasswordLink()).toHaveAttribute(
      "href",
      "/auth/reset-password?email=jane%40example.com",
    );
  });
});
