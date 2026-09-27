import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Home, Settings } from "lucide-react";

import { APP_SHELL_CHROME_ROW_TEST_ID } from "@/src/components/layouts/app-shell-chrome";
import { MobilePageTitle } from "@/src/components/layouts/mobile-page-title";
import PageHeader from "@/src/components/layouts/page-header";
import { AppSidebar } from "@/src/components/nav/AppSidebar/AppSidebar";
import { SidebarPresenceProvider } from "@/src/components/nav/sidebar-presence";
import { SidebarProvider } from "@/src/components/ui/sidebar";

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/project/p1/traces",
    pathname: "/project/[projectId]/traces",
    push: vi.fn(),
    query: { projectId: "p1" },
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        email: "ada@langfuse.com",
        organizations: [],
      },
    },
    status: "authenticated",
  }),
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true, region: "EU" }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: null,
    project: null,
  }),
  useOrgProjectSwitchPaths: () => ({
    getProjectPath: vi.fn(),
    getOrgPath: vi.fn(),
  }),
}));

vi.mock("@/src/components/nav/in-app-ai-agent-button", () => ({
  InAppAiAgentButton: () => null,
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useIsInAppAgentLauncherVisible: () => true,
}));

vi.mock("@/src/components/nav/topbar-brand", () => ({
  TopbarBrand: () => null,
}));

const sidebarArgs = {
  navItems: {
    ungrouped: [{ title: "Home", url: "/", icon: Home, isActive: true }],
    grouped: null,
  },
  secondaryNavItems: {
    ungrouped: [{ title: "Settings", url: "/settings", icon: Settings }],
    grouped: null,
  },
  user: { name: "Ada Lovelace", email: "ada@example.com", avatar: "" },
  userMenuItems: [
    {
      type: "link" as const,
      name: "Account Settings",
      href: "/account/settings",
    },
  ],
  isMobile: false,
  logo: {},
  versionState: { deployment: "cloud" as const },
  showDemoBadge: false,
  v4UpgradeUiEnabled: true,
  notificationState: {
    dismissedIds: [] as string[],
    onDismiss: vi.fn(),
    onLinkClick: vi.fn(),
  },
  organization: null,
  project: null,
  organizations: null,
  canCreateOrganizations: false,
  canCreateProjects: false,
};

const Shell = () => (
  <SidebarPresenceProvider>
    <SidebarProvider>
      <AppSidebar {...sidebarArgs} />
      <PageHeader title="Tracing" />
    </SidebarProvider>
  </SidebarPresenceProvider>
);

describe("app shell chrome row", () => {
  it("puts the sidebar and page-header dividers on the same min-h-11 row", () => {
    const { container } = render(<Shell />);

    const rows = screen.getAllByTestId(APP_SHELL_CHROME_ROW_TEST_ID);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.className).toContain("min-h-11");
      expect(row.className).toContain("border-b");
      expect(row.className).toContain("items-center");
    }

    expect(container.querySelector(".h-1.flex-1.border-b")).toBeNull();
  });

  it("sizes each page-header flex line as a full chrome row", () => {
    const { container } = render(<Shell />);

    const pageHeaderRow = container.querySelector(
      `#page-header [data-testid="${APP_SHELL_CHROME_ROW_TEST_ID}"]`,
    );
    const rowContent = pageHeaderRow?.firstElementChild;

    expect(rowContent?.className).toContain("gap-y-px");
    expect(rowContent?.firstElementChild?.className).toContain("min-h-[43px]");
    expect(rowContent?.lastElementChild?.className).toContain("min-h-[43px]");
  });

  it("keeps the page-header chrome divider full-width on container pages", () => {
    render(
      <SidebarPresenceProvider>
        <SidebarProvider>
          <PageHeader title="Settings" container />
        </SidebarProvider>
      </SidebarPresenceProvider>,
    );

    const row = screen.getByTestId(APP_SHELL_CHROME_ROW_TEST_ID);
    expect(row.className).toContain("border-b");
    expect(row.className).not.toContain("lg:mx-auto");
    expect(row.className).not.toContain("max-w-screen");

    const inner = row.firstElementChild;
    expect(inner).toBeInstanceOf(HTMLElement);
    expect((inner as HTMLElement).className).toContain("lg:mx-auto");
  });
});

describe("mobile page action focus handoff", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("closes before panel focus and restores the trigger only on ordinary dismissals", async () => {
    vi.useFakeTimers();
    const openReview = vi.fn();
    render(
      <>
        <MobilePageTitle
          headerProps={{
            title: "Session",
            actionButtonsMenu: ({
              closeMenu,
            }: {
              closeMenu: (options?: { handoffFocus?: boolean }) => void;
            }) => (
              <>
                <button
                  onClick={() => {
                    closeMenu({ handoffFocus: true });
                    openReview(document.activeElement);
                  }}
                >
                  Open review
                </button>
                <button onClick={() => closeMenu()}>Close menu</button>
              </>
            ),
          }}
        />
        <input aria-label="Review field" />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Open review" }));
    expect(openReview).toHaveBeenCalledWith(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const field = screen.getByRole("textbox", { name: "Review field" });
    field.focus();
    await act(async () => vi.runOnlyPendingTimersAsync());
    expect(field).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    await act(async () => vi.runOnlyPendingTimersAsync());
    expect(trigger).toHaveFocus();
  });
});
