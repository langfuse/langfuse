import { render } from "@testing-library/react";

import AuthError from "@/src/pages/auth/error";
import { MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE } from "@/src/features/auth/constants";

const { captureExceptionMock, addBreadcrumbMock, routerState } = vi.hoisted(
  () => ({
    captureExceptionMock: vi.fn(),
    addBreadcrumbMock: vi.fn(),
    routerState: { query: {} as Record<string, string> },
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
    query: routerState.query,
    push: vi.fn(),
  }),
}));

describe("/auth/error Sentry classification", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    routerState.query = {};
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("does not capture an expired/used magic link (Verification)", () => {
    routerState.query = { error: "Verification" };
    render(<AuthError />);

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  it("does not capture the deliberate SSO domain rejection", () => {
    routerState.query = { error: MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE };
    render(<AuthError />);

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });

  // Negative fixtures: a genuine auth-system failure still captures.
  it.each(["Configuration", "AccessDenied", "Unknown provider explosion"])(
    "still captures %j",
    (error) => {
      routerState.query = { error };
      render(<AuthError />);

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const [err, options] = captureExceptionMock.mock.calls[0]!;
      expect(err.message).toBe(
        `ErrorPageWithSentry rendered: Authentication Error, ${error}`,
      );
      expect(options.tags.area).toBe("error-page");
    },
  );

  it("still captures when no error param is present (unknown state)", () => {
    render(<AuthError />);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
