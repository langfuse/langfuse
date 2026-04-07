import type { ReactNode } from "react";
import {
  Beaker,
  ClipboardPen,
  Clock,
  Database,
  FileJson,
  Grid2X2,
  Home,
  LayoutDashboard,
  Lightbulb,
  ListTree,
  Settings,
  SquarePercent,
  TerminalIcon,
  UsersIcon,
} from "lucide-react";
import { AppSidebar } from "@/src/components/nav/app-sidebar";
import Page from "@/src/components/layouts/page";
import { RouteGroup } from "@/src/components/layouts/routes";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AgentationSurface } from "@/src/features/agentation/components/AgentationSurface";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import { DEV_PATHS } from "../lib/devPages";

type DevProjectPreviewShellProps = {
  currentPath: string;
  title: string;
  children: ReactNode;
};

// DEV ONLY:
// Shared mocked project shell for auth-free design work under /dev.
// Keep all experimentation here so production routes remain intact.
export function DevProjectPreviewShell({
  currentPath,
  title,
  children,
}: DevProjectPreviewShellProps) {
  const previewNavigation = {
    mainNavigation: {
      ungrouped: [
        {
          title: "Organizations",
          url: DEV_PATHS.organizations,
          icon: Grid2X2,
          isActive: currentPath === DEV_PATHS.organizations,
        },
        {
          title: "Home",
          url: DEV_PATHS.home,
          icon: Home,
          isActive: currentPath === DEV_PATHS.home,
        },
        {
          title: "Dashboards",
          url: DEV_PATHS.dashboard,
          icon: LayoutDashboard,
          isActive: currentPath === DEV_PATHS.dashboard,
        },
      ],
      grouped: {
        [RouteGroup.Observability]: [
          {
            title: "Tracing",
            url: DEV_PATHS.tracing,
            icon: ListTree,
            isActive: currentPath === DEV_PATHS.tracing,
          },
          {
            title: "Sessions",
            url: DEV_PATHS.sessions,
            icon: Clock,
            isActive: currentPath === DEV_PATHS.sessions,
          },
          {
            title: "Users",
            url: DEV_PATHS.users,
            icon: UsersIcon,
            isActive: currentPath === DEV_PATHS.users,
          },
        ],
        [RouteGroup.PromptManagement]: [
          {
            title: "Prompts",
            url: DEV_PATHS.prompts,
            icon: FileJson,
            isActive: currentPath === DEV_PATHS.prompts,
          },
          {
            title: "Playground",
            url: DEV_PATHS.playground,
            icon: TerminalIcon,
            isActive: currentPath === DEV_PATHS.playground,
          },
        ],
        [RouteGroup.Evaluation]: [
          {
            title: "Scores",
            url: DEV_PATHS.scores,
            icon: SquarePercent,
            isActive: currentPath === DEV_PATHS.scores,
          },
          {
            title: "LLM-as-a-Judge",
            url: DEV_PATHS.evals,
            icon: Lightbulb,
            isActive: currentPath === DEV_PATHS.evals,
          },
          {
            title: "Human Annotation",
            url: DEV_PATHS.humanAnnotation,
            icon: ClipboardPen,
            isActive: currentPath === DEV_PATHS.humanAnnotation,
          },
          {
            title: "Datasets",
            url: DEV_PATHS.datasets,
            icon: Database,
            isActive: currentPath === DEV_PATHS.datasets,
          },
          {
            title: "Experiments",
            url: DEV_PATHS.experiments,
            icon: Beaker,
            isActive: currentPath === DEV_PATHS.experiments,
            label: "Beta",
          },
        ],
      },
    },
    secondaryNavigation: {
      ungrouped: [
        {
          title: "Settings",
          url: DEV_PATHS.settings,
          icon: Settings,
          isActive: currentPath === DEV_PATHS.settings,
        },
      ],
      grouped: null,
    },
  };

  return (
    <div className="bg-background min-h-dvh">
      <SidebarProvider>
        <div className="flex h-dvh w-full flex-col">
          <div className="flex min-h-0 flex-1">
            <AppSidebar
              navItems={previewNavigation.mainNavigation}
              secondaryNavItems={previewNavigation.secondaryNavigation}
              userNavProps={{
                user: {
                  name: "Evren Dombak",
                  email: "evren@langfuse.local",
                  avatar: "",
                },
                items: [
                  {
                    name: "Theme",
                    onClick: () => {},
                    content: <ThemeToggle />,
                  },
                ],
              }}
            />
            <SidebarInset className="max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
              <Page
                scrollable
                withPadding
                headerProps={{
                  title,
                  breadcrumb: [
                    { name: "langofuso", href: "/" },
                    { name: "langfuse-redesign" },
                  ],
                }}
              >
                {children}
              </Page>
              <AgentationSurface />
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
