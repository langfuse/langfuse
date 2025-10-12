import { type Flag } from "@/src/features/feature-flags/types";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import {
  Database,
  LayoutDashboard,
  LifeBuoy,
  ListTree,
  type LucideIcon,
  Settings,
  UsersIcon,
  TerminalIcon,
  Lightbulb,
  Grid2X2,
  Sparkle,
  FileJson,
  Search,
  Home,
  SquarePercent,
  ClipboardPen,
  Clock,
} from "lucide-react";
import { type ReactNode } from "react";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type User } from "next-auth";
import { type OrganizationScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { SupportMenuDropdown } from "@/src/components/nav/support-menu-dropdown";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { CloudStatusMenu } from "@/src/features/cloud-status-notification/components/CloudStatusMenu";
import { type ProductModule } from "@/src/ee/features/ui-customization/productModuleSchema";
import { useTranslation } from "react-i18next";

export enum RouteSection {
  Main = "main",
  Secondary = "secondary",
}

export enum RouteGroup {
  Observability = "Observability",
  PromptManagement = "Prompt Management",
  Evaluation = "Evaluation",
}

export type Route = {
  title: string;
  menuNode?: ReactNode;
  featureFlag?: Flag;
  label?: string | ReactNode;
  projectRbacScopes?: ProjectScope[]; // array treated as OR
  organizationRbacScope?: OrganizationScope;
  icon?: LucideIcon; // ignored for nested routes
  pathname: string; // link
  items?: Array<Route>; // folder
  section?: RouteSection; // which section of the sidebar (top/main/bottom)
  newTab?: boolean; // open in new tab
  entitlements?: Entitlement[]; // entitlements required, array treated as OR
  productModule?: ProductModule; // Product module this route belongs to. Used to show/hide modules via ui customization.
  show?: (p: {
    organization: User["organizations"][number] | undefined;
  }) => boolean;
  group?: RouteGroup; // group this route belongs to (within a section)
};

export function useRoutes(): Route[] {
  const { t } = useTranslation();

  return [
    {
      title: t("common.navigation.goTo"),
      pathname: "", // Empty pathname since this is a dropdown
      icon: Search,
      menuNode: <CommandMenuTrigger />,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.organizations"),
      pathname: "/",
      icon: Grid2X2,
      show: ({ organization }) => organization === undefined,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.projects"),
      pathname: "/organization/[organizationId]",
      icon: Grid2X2,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.home"),
      pathname: `/project/[projectId]`,
      icon: Home,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.dashboards"),
      pathname: `/project/[projectId]/dashboards`,
      icon: LayoutDashboard,
      productModule: "dashboards",
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.tracing"),
      icon: ListTree,
      productModule: "tracing",
      group: RouteGroup.Observability,
      section: RouteSection.Main,
      pathname: `/project/[projectId]/traces`,
    },
    {
      title: t("common.navigation.sessions"),
      icon: Clock,
      productModule: "tracing",
      group: RouteGroup.Observability,
      section: RouteSection.Main,
      pathname: `/project/[projectId]/sessions`,
    },
    {
      title: t("common.navigation.users"),
      pathname: `/project/[projectId]/users`,
      icon: UsersIcon,
      productModule: "tracing",
      group: RouteGroup.Observability,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.prompts"),
      pathname: "/project/[projectId]/prompts",
      icon: FileJson,
      projectRbacScopes: ["prompts:read"],
      productModule: "prompt-management",
      group: RouteGroup.PromptManagement,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.playground"),
      pathname: "/project/[projectId]/playground",
      icon: TerminalIcon,
      productModule: "playground",
      group: RouteGroup.PromptManagement,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.scores"),
      pathname: `/project/[projectId]/scores`,
      group: RouteGroup.Evaluation,
      section: RouteSection.Main,
      icon: SquarePercent,
    },
    {
      title: t("common.navigation.llmAsJudge"),
      icon: Lightbulb,
      productModule: "evaluation",
      projectRbacScopes: ["evalJob:read"],
      group: RouteGroup.Evaluation,
      section: RouteSection.Main,
      pathname: `/project/[projectId]/evals`,
    },
    {
      title: t("common.navigation.humanAnnotation"),
      pathname: `/project/[projectId]/annotation-queues`,
      projectRbacScopes: ["annotationQueues:read"],
      group: RouteGroup.Evaluation,
      section: RouteSection.Main,
      icon: ClipboardPen,
    },
    {
      title: t("common.navigation.datasets"),
      pathname: `/project/[projectId]/datasets`,
      icon: Database,
      productModule: "datasets",
      group: RouteGroup.Evaluation,
      section: RouteSection.Main,
    },
    {
      title: t("common.navigation.upgrade"),
      icon: Sparkle,
      pathname: "/project/[projectId]/settings/billing",
      section: RouteSection.Secondary,
      entitlements: ["cloud-billing"],
      organizationRbacScope: "langfuseCloudBilling:CRUD",
      show: ({ organization }) => organization?.plan === "cloud:hobby",
    },
    {
      title: t("common.navigation.upgrade"),
      icon: Sparkle,
      pathname: "/organization/[organizationId]/settings/billing",
      section: RouteSection.Secondary,
      entitlements: ["cloud-billing"],
      organizationRbacScope: "langfuseCloudBilling:CRUD",
      show: ({ organization }) => organization?.plan === "cloud:hobby",
    },
    {
      title: t("common.navigation.cloudStatus"),
      section: RouteSection.Secondary,
      pathname: "",
      menuNode: <CloudStatusMenu />,
    },
    {
      title: t("common.navigation.settings"),
      pathname: "/project/[projectId]/settings",
      icon: Settings,
      section: RouteSection.Secondary,
    },
    {
      title: t("common.navigation.settings"),
      pathname: "/organization/[organizationId]/settings",
      icon: Settings,
      section: RouteSection.Secondary,
    },
    {
      title: t("common.navigation.support"),
      icon: LifeBuoy,
      section: RouteSection.Secondary,
      pathname: "", // Empty pathname since this is a dropdown
      menuNode: <SupportMenuDropdown />,
    },
  ];
}

function CommandMenuTrigger() {
  const { setOpen } = useCommandMenu();
  const capture = usePostHogClientCapture();
  const { t } = useTranslation();

  return (
    <SidebarMenuButton
      onClick={() => {
        capture("cmd_k_menu:opened", {
          source: "main_navigation",
        });
        setOpen(true);
      }}
      className="whitespace-nowrap"
    >
      <Search className="h-4 w-4" />
      {t("common.navigation.goTo")}
      <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded-md border px-1.5 font-mono text-[10px]">
        {navigator.userAgent.includes("Mac") ? (
          <span className="text-[12px]">⌘</span>
        ) : (
          <span>Ctrl</span>
        )}
        <span>K</span>
      </kbd>
    </SidebarMenuButton>
  );
}
