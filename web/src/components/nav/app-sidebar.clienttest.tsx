import { render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import { SidebarProvider } from "@/src/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("../../env.mjs", () => ({
  env: {},
}));

jest.mock("../LangfuseLogo", () => ({
  LangfuseLogo: () => <div data-testid="langfuse-logo" />,
}));

jest.mock("./sidebar-notifications", () => ({
  SidebarNotifications: () => <div data-testid="sidebar-notifications" />,
}));

jest.mock("../../features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: false }),
}));

jest.mock("../layouts/routes", () => ({
  RouteGroup: {
    Observability: "Observability",
    PromptManagement: "Prompt Management",
    Evaluation: "Evaluation",
  },
}));

const mockedUseRouter = jest.mocked(useRouter);

const navItems = {
  ungrouped: [
    {
      title: "Home",
      url: "/project/project-1",
      isActive: true,
    },
  ],
  grouped: {
    Observability: [
      {
        title: "Tracing",
        url: "/project/project-1/traces",
      },
    ],
  },
};

const secondaryNavItems = {
  ungrouped: [
    {
      title: "Settings",
      url: "/project/project-1/settings",
    },
  ],
  grouped: null,
};

function renderSidebar(pathname: string) {
  mockedUseRouter.mockReturnValue({
    pathname,
    asPath: pathname,
    query: {
      projectId: "project-1",
    },
    push: jest.fn(),
    replace: jest.fn(),
  } as unknown as ReturnType<typeof useRouter>);

  return render(
    <SidebarProvider>
      <div className="flex h-dvh w-full">
        <AppSidebar
          navItems={navItems}
          secondaryNavItems={secondaryNavItems}
          userNavProps={{
            user: {
              name: "Evren Dombak",
              email: "evren@langfuse.local",
              avatar: "",
            },
            items: [{ name: "Sign out", onClick: jest.fn() }],
          }}
        />
      </div>
    </SidebarProvider>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("uses the top account switcher layout on greenfield routes", () => {
    const { container } = renderSidebar("/dev/greenfield");

    expect(screen.getByTestId("sidebar-account-switcher")).toBeTruthy();
    expect(screen.queryByTestId("sidebar-user-menu")).toBeNull();
    expect(screen.queryByTestId("sidebar-notifications")).toBeNull();
    expect(container.querySelector('[data-sidebar="footer"]')).toBeNull();
  });

  it("uses the top account switcher layout on nested greenfield workspace routes", () => {
    const { container } = renderSidebar(
      "/project/[projectId]/greenfield/workspace/prompt/[...slug]",
    );

    expect(screen.getByTestId("sidebar-account-switcher")).toBeTruthy();
    expect(screen.queryByTestId("sidebar-user-menu")).toBeNull();
    expect(screen.queryByTestId("sidebar-notifications")).toBeNull();
    expect(container.querySelector('[data-sidebar="footer"]')).toBeNull();
  });

  it("keeps the default footer layout on non-greenfield routes", () => {
    const { container } = renderSidebar("/project/[projectId]/traces");

    expect(screen.getByTestId("sidebar-user-menu")).toBeTruthy();
    expect(screen.getByTestId("sidebar-notifications")).toBeTruthy();
    expect(container.querySelector('[data-sidebar="footer"]')).toBeTruthy();
  });
});
