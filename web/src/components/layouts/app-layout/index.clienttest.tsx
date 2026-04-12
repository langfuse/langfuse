import { act, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { AppLayout } from "./index";
import { useAuthSession } from "./hooks/useAuthSession";
import { useLayoutConfiguration } from "./hooks/useLayoutConfiguration";
import { useAuthGuard } from "./hooks/useAuthGuard";
import { useProjectAccess } from "./hooks/useProjectAccess";
import { useFilteredNavigation } from "./hooks/useFilteredNavigation";
import { useLayoutMetadata } from "./hooks/useLayoutMetadata";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/dynamic", () => () => () => null);

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("agentation", () => ({
  Agentation: () => null,
}));

jest.mock("./hooks/useAuthSession", () => ({
  useAuthSession: jest.fn(),
}));

jest.mock("./hooks/useLayoutConfiguration", () => ({
  useLayoutConfiguration: jest.fn(),
}));

jest.mock("./hooks/useAuthGuard", () => ({
  useAuthGuard: jest.fn(),
}));

jest.mock("./hooks/useProjectAccess", () => ({
  useProjectAccess: jest.fn(),
}));

jest.mock("./hooks/useFilteredNavigation", () => ({
  useFilteredNavigation: jest.fn(),
}));

jest.mock("./hooks/useLayoutMetadata", () => ({
  useLayoutMetadata: jest.fn(),
}));

jest.mock("./variants/LoadingLayout", () => ({
  LoadingLayout: ({ message }: { message: string }) => <div>{message}</div>,
}));

jest.mock("./variants/UnauthenticatedLayout", () => ({
  UnauthenticatedLayout: ({ children }: React.PropsWithChildren) => (
    <div data-testid="unauthenticated-layout">{children}</div>
  ),
}));

jest.mock("./variants/MinimalLayout", () => ({
  MinimalLayout: ({ children }: React.PropsWithChildren) => (
    <div data-testid="minimal-layout">{children}</div>
  ),
}));

jest.mock("./variants/AuthenticatedLayout", () => ({
  AuthenticatedLayout: ({ children }: React.PropsWithChildren) => (
    <div data-testid="authenticated-layout">{children}</div>
  ),
}));

jest.mock(
  "@/src/components/error-page",
  () => ({
    ErrorPageWithSentry: ({ title }: { title: string }) => <div>{title}</div>,
  }),
  { virtual: true },
);

const mockedUseRouter = jest.mocked(useRouter);
const mockedUseSession = jest.mocked(useSession);
const mockedUseAuthSession = jest.mocked(useAuthSession);
const mockedUseLayoutConfiguration = jest.mocked(useLayoutConfiguration);
const mockedUseAuthGuard = jest.mocked(useAuthGuard);
const mockedUseProjectAccess = jest.mocked(useProjectAccess);
const mockedUseFilteredNavigation = jest.mocked(useFilteredNavigation);
const mockedUseLayoutMetadata = jest.mocked(useLayoutMetadata);

const authenticatedSession = {
  status: "authenticated" as const,
  data: {
    user: {
      id: "user-1",
      name: "Evren",
      email: "evren@langfuse.local",
      organizations: [],
    },
  },
};

const navigation = {
  mainNavigation: {
    ungrouped: [],
    grouped: null,
    flattened: [],
  },
  secondaryNavigation: {
    ungrouped: [],
    grouped: null,
    flattened: [],
  },
  navigation: [],
};

describe("AppLayout", () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({
      replace: jest.fn(),
      push: jest.fn(),
      query: {},
      pathname: "/project/project-1/traces",
      asPath: "/project/project-1/traces",
    } as unknown as ReturnType<typeof useRouter>);
    mockedUseSession.mockReturnValue(authenticatedSession);
    mockedUseAuthSession.mockReturnValue(authenticatedSession);
    mockedUseLayoutConfiguration.mockReturnValue({
      variant: "authenticated",
      hideNavigation: false,
      isPublishable: false,
    });
    mockedUseAuthGuard.mockReturnValue({ action: "allow" });
    mockedUseProjectAccess.mockReturnValue({ hasAccess: true });
    mockedUseFilteredNavigation.mockReturnValue(navigation);
    mockedUseLayoutMetadata.mockReturnValue({
      title: "Tracing",
      faviconPath: "/favicon.svg",
      favicon256Path: "/favicon-256.png",
      appleTouchIconPath: "/apple-touch-icon.png",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the agentation surface in the authenticated app shell", () => {
    render(
      <AppLayout>
        <div>Core route content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId("authenticated-layout")).toBeTruthy();
    expect(screen.getByText("Core route content")).toBeTruthy();
    expect(screen.getByTestId("agentation-surface")).toBeTruthy();
  });

  it("does not render the agentation surface in minimal layouts", () => {
    mockedUseLayoutConfiguration.mockReturnValue({
      variant: "minimal",
      hideNavigation: true,
      isPublishable: false,
    });

    render(
      <AppLayout>
        <div>Minimal route content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId("minimal-layout")).toBeTruthy();
    expect(screen.queryByTestId("agentation-surface")).toBeNull();
  });

  it("renders the spielwiese loading page instead of the generic loading layout on spielwiese routes", () => {
    mockedUseRouter.mockReturnValue({
      replace: jest.fn(),
      push: jest.fn(),
      query: {},
      pathname: "/dev/spielwiese/[[...slug]]",
      asPath: "/dev/spielwiese/dashboard",
    } as unknown as ReturnType<typeof useRouter>);
    mockedUseAuthGuard.mockReturnValue({
      action: "loading",
      message: "Loading",
    });

    render(
      <AppLayout>
        <div>Spielwiese route content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId("spielwiese-loading-page")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-loading-page").getAttribute("data-route"),
    ).toBe("dashboard");
    expect(screen.queryByText("Loading")).toBeNull();
  });

  it("fades the spielwiese loading page out once the route is ready", () => {
    jest.useFakeTimers();
    try {
      mockedUseRouter.mockReturnValue({
        replace: jest.fn(),
        push: jest.fn(),
        query: {},
        pathname: "/dev/spielwiese/[[...slug]]",
        asPath: "/dev/spielwiese/dashboard",
      } as unknown as ReturnType<typeof useRouter>);
      mockedUseLayoutConfiguration.mockReturnValue({
        variant: "minimal",
        hideNavigation: true,
        isPublishable: false,
      });
      mockedUseAuthGuard.mockReturnValue({
        action: "loading",
        message: "Loading",
      });

      const { rerender } = render(
        <AppLayout>
          <div>Spielwiese route content</div>
        </AppLayout>,
      );

      mockedUseAuthGuard.mockReturnValue({ action: "allow" });
      rerender(
        <AppLayout>
          <div>Spielwiese route content</div>
        </AppLayout>,
      );

      expect(screen.getByTestId("minimal-layout")).toBeTruthy();
      expect(screen.getByText("Spielwiese route content")).toBeTruthy();
      expect(
        screen.getByTestId("spielwiese-loading-fade-overlay"),
      ).toBeTruthy();
      expect(
        screen.getByTestId("spielwiese-loading-fade-overlay").className,
      ).toContain("opacity-0");

      act(() => {
        jest.advanceTimersByTime(220);
      });

      expect(
        screen.queryByTestId("spielwiese-loading-fade-overlay"),
      ).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the generic loading layout for non-spielwiese routes", () => {
    mockedUseAuthGuard.mockReturnValue({
      action: "loading",
      message: "Loading",
    });

    render(
      <AppLayout>
        <div>Regular route content</div>
      </AppLayout>,
    );

    expect(screen.getByText("Loading")).toBeTruthy();
    expect(screen.queryByTestId("spielwiese-loading-page")).toBeNull();
  });
});
