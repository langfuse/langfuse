import { render, screen } from "@testing-library/react";

import { ErrorPageWithSentry } from "@/src/components/error-page";

const { captureExceptionMock, addBreadcrumbMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  addBreadcrumbMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: addBreadcrumbMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/auth/error", query: {}, push: vi.fn() }),
}));

describe("ErrorPageWithSentry", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureExceptionMock.mockClear();
    addBreadcrumbMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("captures a real Error with the error-page area by default", () => {
    render(<ErrorPageWithSentry title="Some Error" message="It broke" />);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [err, options] = captureExceptionMock.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "ErrorPageWithSentry rendered: Some Error, It broke",
    );
    expect(options.tags.area).toBe("error-page");
    expect(addBreadcrumbMock).not.toHaveBeenCalled();
  });

  it("breadcrumbs instead of capturing when the outcome is expected", () => {
    render(
      <ErrorPageWithSentry
        title="Authentication Error"
        message="Verification"
        expected
      />,
    );

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    const crumb = addBreadcrumbMock.mock.calls[0]![0];
    expect(crumb.category).toBe("error-page");
    expect(crumb.data).toEqual({
      title: "Authentication Error",
      message: "Verification",
    });
  });

  it("renders the same UX either way", () => {
    render(
      <ErrorPageWithSentry
        title="Authentication Error"
        message="Verification"
        expected
      />,
    );

    expect(screen.getByText("Authentication Error")).toBeInTheDocument();
    expect(screen.getByText("Verification")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });
});
