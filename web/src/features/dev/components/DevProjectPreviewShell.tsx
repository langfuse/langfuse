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
  ListTree,
  Settings,
  SquarePercent,
  TerminalIcon,
  UsersIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { AppSidebar } from "@/src/components/nav/app-sidebar";
import Page from "@/src/components/layouts/page";
import { RouteGroup } from "@/src/components/layouts/routes";
import { Badge } from "@/src/components/ui/badge";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";

const Agentation = dynamic(
  () => import("agentation").then((mod) => mod.Agentation),
  { ssr: false },
);

const DEV_ROUTES = {
  home: "/dev/dashboard",
  organizations: "/dev/organization-overview",
  greenfield: "/dev/greenfield",
} as const;

type DevProjectPreviewShellProps = {
  currentPath: string;
  title: string;
  helpDescription: ReactNode;
  children: ReactNode;
};

// DEV ONLY:
// Shared mocked project shell for auth-free design work under /dev.
// Keep all experimentation here so production routes remain intact.
export function DevProjectPreviewShell({
  currentPath,
  title,
  helpDescription,
  children,
}: DevProjectPreviewShellProps) {
  const previewNavigation = {
    mainNavigation: {
      ungrouped: [
        {
          title: "Organizations",
          url: DEV_ROUTES.organizations,
          icon: Grid2X2,
          isActive: currentPath === DEV_ROUTES.organizations,
        },
        {
          title: "Home",
          url: DEV_ROUTES.home,
          icon: Home,
          isActive: currentPath === DEV_ROUTES.home,
        },
        {
          title: "Dashboards",
          url: DEV_ROUTES.home,
          icon: LayoutDashboard,
          isActive: currentPath === DEV_ROUTES.home,
        },
      ],
      grouped: {
        [RouteGroup.Observability]: [
          {
            title: "Tracing",
            url: DEV_ROUTES.home,
            icon: ListTree,
            isActive: false,
          },
          {
            title: "Sessions",
            url: DEV_ROUTES.home,
            icon: Clock,
            isActive: false,
          },
          {
            title: "Users",
            url: DEV_ROUTES.home,
            icon: UsersIcon,
            isActive: false,
          },
        ],
        [RouteGroup.PromptManagement]: [
          {
            title: "Prompts",
            url: DEV_ROUTES.home,
            icon: FileJson,
            isActive: false,
          },
          {
            title: "Playground",
            url: DEV_ROUTES.greenfield,
            icon: TerminalIcon,
            isActive: currentPath === DEV_ROUTES.greenfield,
          },
        ],
        [RouteGroup.Evaluation]: [
          {
            title: "Scores",
            url: DEV_ROUTES.home,
            icon: SquarePercent,
            isActive: false,
          },
          {
            title: "Human Annotation",
            url: DEV_ROUTES.home,
            icon: ClipboardPen,
            isActive: false,
          },
          {
            title: "Datasets",
            url: DEV_ROUTES.home,
            icon: Database,
            isActive: false,
          },
          {
            title: "Experiments",
            url: DEV_ROUTES.home,
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
          url: DEV_ROUTES.home,
          icon: Settings,
          isActive: false,
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
                  title,
                  breadcrumb: [
                    { name: "langofuso", href: "/" },
                    { name: "langfuse-redesign" },
                  ],
                  titleBadges: (
                    <Badge variant="warning" size="sm">
                      DEV ONLY: Auth bypass active
                    </Badge>
                  ),
                  help: {
                    description: helpDescription,
                  },
                }}
              >
                {children}
              </Page>
              <Agentation />
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
