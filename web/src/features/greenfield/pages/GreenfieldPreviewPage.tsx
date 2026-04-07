import {
  Beaker,
  ClipboardPen,
  Clock,
  Database,
  FileJson,
  Grid2X2,
  Home,
  LayoutDashboard,
  ListTree,
  Settings,
  SquarePercent,
  TerminalIcon,
  UsersIcon,
} from "lucide-react";
import { AppSidebar } from "@/src/components/nav/app-sidebar";
import Page from "@/src/components/layouts/page";
import { RouteGroup } from "@/src/components/layouts/routes";
import { Badge } from "@/src/components/ui/badge";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import { GreenfieldOnboardingView } from "../components/GreenfieldOnboardingView";

const PREVIEW_ROUTE = "/dev/greenfield";

const previewNavigation = {
  mainNavigation: {
    ungrouped: [
      {
        title: "Organizations",
        url: PREVIEW_ROUTE,
        icon: Grid2X2,
        isActive: false,
      },
      {
        title: "Home",
        url: PREVIEW_ROUTE,
        icon: Home,
        isActive: true,
      },
      {
        title: "Dashboards",
        url: PREVIEW_ROUTE,
        icon: LayoutDashboard,
        isActive: false,
      },
    ],
    grouped: {
      [RouteGroup.Observability]: [
        {
          title: "Tracing",
          url: PREVIEW_ROUTE,
          icon: ListTree,
          isActive: false,
        },
        {
          title: "Sessions",
          url: PREVIEW_ROUTE,
          icon: Clock,
          isActive: false,
        },
        {
          title: "Users",
          url: PREVIEW_ROUTE,
          icon: UsersIcon,
          isActive: false,
        },
      ],
      [RouteGroup.PromptManagement]: [
        {
          title: "Prompts",
          url: PREVIEW_ROUTE,
          icon: FileJson,
          isActive: false,
        },
        {
          title: "Playground",
          url: PREVIEW_ROUTE,
          icon: TerminalIcon,
          isActive: false,
        },
      ],
      [RouteGroup.Evaluation]: [
        {
          title: "Scores",
          url: PREVIEW_ROUTE,
          icon: SquarePercent,
          isActive: false,
        },
        {
          title: "Human Annotation",
          url: PREVIEW_ROUTE,
          icon: ClipboardPen,
          isActive: false,
        },
        {
          title: "Datasets",
          url: PREVIEW_ROUTE,
          icon: Database,
          isActive: false,
        },
        {
          title: "Experiments",
          url: PREVIEW_ROUTE,
          icon: Beaker,
          isActive: false,
          label: "Beta",
        },
      ],
    },
  },
  secondaryNavigation: {
    ungrouped: [
      {
        title: "Settings",
        url: PREVIEW_ROUTE,
        icon: Settings,
        isActive: false,
      },
    ],
    grouped: null,
  },
};

// DEV ONLY:
// This page deliberately bypasses auth and renders a mocked project shell so
// the greenfield onboarding design can be reviewed without sign-in.
// Do not treat this route as production behavior.
export default function GreenfieldPreviewPage() {
  return (
    <div className="bg-background -mx-4 -my-4 min-h-dvh sm:-mx-6 lg:-mx-8">
      <SidebarProvider>
        <div className="flex h-dvh w-full flex-col">
          <div className="flex min-h-0 flex-1">
            <AppSidebar
              navItems={previewNavigation.mainNavigation}
              secondaryNavItems={previewNavigation.secondaryNavigation}
              userNavProps={{
                user: {
                  name: "Design Preview",
                  email: "preview@langfuse.local",
                  avatar: "",
                },
                items: [
                  {
                    name: "Theme",
                    onClick: () => {},
                    content: <ThemeToggle />,
                  },
                  { name: "Auth bypass active" },
                ],
              }}
            />
            <SidebarInset className="max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
              <Page
                scrollable
                withPadding
                headerProps={{
                  title: "Greenfield",
                  titleBadges: (
                    <Badge variant="warning" size="sm">
                      DEV ONLY: Auth bypass active
                    </Badge>
                  ),
                  help: {
                    description:
                      "This is a mocked authenticated shell for design review only. The real authenticated greenfield route remains unchanged.",
                  },
                }}
              >
                <GreenfieldOnboardingView
                  firstName="Evren"
                  projectId="preview-project"
                />
              </Page>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
