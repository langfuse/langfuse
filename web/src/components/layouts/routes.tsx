import { type Flag } from "@/src/features/feature-flags/types";
import { type ProjectScope } from "@langfuse/shared";
import {
  BellRing,
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
  Beaker,
} from "lucide-react";
import { type ReactNode } from "react";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type Session } from "next-auth";
import { type OrganizationScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { SupportButton } from "@/src/components/nav/support-button";
import { V4MigrationNavItem } from "@/src/features/v4-migration/V4MigrationNavItem";
import { V4SidebarToggle } from "@/src/features/events/components/V4SidebarToggle";
import { BookACallButton } from "@/src/components/nav/book-a-call-button";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { CloudStatusMenu } from "@/src/features/cloud-status-notification/components/CloudStatusMenu";
import { type ProductModule } from "@/src/ee/features/ui-customization/productModuleSchema";
import { useTranslations } from "next-intl";
import type { NavigationItemMessageKey } from "@/src/features/i18n/messages";

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
  titleKey: NavigationItemMessageKey;
  menuNode?: ReactNode;
  featureFlag?: Flag;
  label?: string | ReactNode;
  projectRbacScopes?: ProjectScope[]; // array treated as OR
  organizationRbacScope?: OrganizationScope;
  icon?: LucideIcon; // ignored for nested routes
  pathname: string; // link
  legacyPathname?: string; // link used when the V4 preview is disabled
  items?: Array<Route>; // folder
  section?: RouteSection; // which section of the sidebar (top/main/bottom)
  newTab?: boolean; // open in new tab
  entitlements?: Entitlement[]; // entitlements required, array treated as OR
  productModule?: ProductModule; // Product module this route belongs to. Used to show/hide modules via ui customization.
  show?: (p: {
    organization:
      | NonNullable<Session["user"]>["organizations"][number]
      | undefined;
    projectId: string | undefined;
    isLangfuseCloud: boolean;
    v4WriteMode: undefined | "legacy" | "dual" | "events_only"; // undefined until the session has loaded
    v4UpgradeUiAvailable: boolean; // deployment shows the v4 migration UI (see isV4UpgradeUiAvailable)
  }) => boolean;
  group?: RouteGroup; // group this route belongs to (within a section)
};

export const ROUTES: Route[] = [
  {
    title: "Go to...",
    titleKey: "goTo",
    pathname: "", // Empty pathname since this is a dropdown
    icon: Search,
    menuNode: <CommandMenuTrigger />,
    section: RouteSection.Main,
  },
  {
    title: "Organizations",
    titleKey: "organizations",
    pathname: "/",
    icon: Grid2X2,
    show: ({ organization }) => organization === undefined,
    section: RouteSection.Main,
  },
  {
    title: "Projects",
    titleKey: "projects",
    pathname: "/organization/[organizationId]",
    icon: Grid2X2,
    section: RouteSection.Main,
  },
  {
    title: "Home",
    titleKey: "home",
    pathname: `/project/[projectId]`,
    icon: Home,
    section: RouteSection.Main,
  },
  {
    title: "Dashboards",
    titleKey: "dashboards",
    pathname: `/project/[projectId]/dashboards`,
    icon: LayoutDashboard,
    productModule: "dashboards",
    section: RouteSection.Main,
  },
  {
    title: "Tracing",
    titleKey: "tracing",
    icon: ListTree,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
    pathname: `/project/[projectId]/traces`,
  },
  {
    title: "Sessions",
    titleKey: "sessions",
    icon: Clock,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
    pathname: `/project/[projectId]/sessions`,
  },
  {
    title: "Users",
    titleKey: "users",
    pathname: `/project/[projectId]/users`,
    icon: UsersIcon,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
  },
  {
    title: "Alerts",
    titleKey: "alerts",
    pathname: "/project/[projectId]/alerts",
    icon: BellRing,
    projectRbacScopes: ["alerts:read"],
    show: ({ v4WriteMode }) => Boolean(v4WriteMode) && v4WriteMode !== "legacy",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
  },
  {
    title: "Prompts",
    titleKey: "prompts",
    pathname: "/project/[projectId]/prompts",
    icon: FileJson,
    projectRbacScopes: ["prompts:read"],
    productModule: "prompt-management",
    group: RouteGroup.PromptManagement,
    section: RouteSection.Main,
  },
  {
    title: "Playground",
    titleKey: "playground",
    pathname: "/project/[projectId]/playground",
    icon: TerminalIcon,
    productModule: "playground",
    group: RouteGroup.PromptManagement,
    section: RouteSection.Main,
  },
  {
    title: "Scores",
    titleKey: "scores",
    pathname: `/project/[projectId]/scores`,
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    icon: SquarePercent,
  },
  {
    title: "Evaluators",
    titleKey: "evaluators",
    icon: Lightbulb,
    productModule: "evaluation",
    projectRbacScopes: ["evaluator:read", "evaluationRule:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    pathname: `/project/[projectId]/evals`,
    legacyPathname: `/project/[projectId]/evals/legacy`,
  },
  {
    title: "Human Annotation",
    titleKey: "humanAnnotation",
    pathname: `/project/[projectId]/annotation-queues`,
    projectRbacScopes: ["annotationQueues:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    icon: ClipboardPen,
  },
  {
    title: "Datasets",
    titleKey: "datasets",
    pathname: `/project/[projectId]/datasets`,
    icon: Database,
    productModule: "datasets",
    projectRbacScopes: ["datasets:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
  },
  {
    title: "Experiments",
    titleKey: "experiments",
    pathname: `/project/[projectId]/experiments`,
    icon: Beaker,
    featureFlag: "experimentsV4Enabled",
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
  },
  {
    // Keep Action required first in the secondary nav so it is not sandwiched
    // between regular items like Upgrade Plan and Settings.
    title: "Update",
    titleKey: "update",
    pathname: "",
    section: RouteSection.Secondary,
    show: ({ projectId, v4UpgradeUiAvailable }) =>
      v4UpgradeUiAvailable && projectId !== undefined,
    menuNode: <V4MigrationNavItem />,
  },
  {
    title: "Cloud Status",
    titleKey: "cloudStatus",
    section: RouteSection.Secondary,
    pathname: "",
    menuNode: <CloudStatusMenu />,
  },
  {
    title: "V4 Preview",
    titleKey: "v4Preview",
    pathname: "",
    section: RouteSection.Secondary,
    featureFlag: "v4BetaToggleVisible",
    menuNode: <V4SidebarToggle />,
  },
  {
    title: "Upgrade Plan",
    titleKey: "upgradePlan",
    icon: Sparkle,
    pathname: "/project/[projectId]/settings/billing",
    section: RouteSection.Secondary,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "Upgrade Plan",
    titleKey: "upgradePlan",
    icon: Sparkle,
    pathname: "/organization/[organizationId]/settings/billing",
    section: RouteSection.Secondary,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "Settings",
    titleKey: "settings",
    pathname: "/project/[projectId]/settings",
    icon: Settings,
    section: RouteSection.Secondary,
  },
  {
    title: "Settings",
    titleKey: "settings",
    pathname: "/organization/[organizationId]/settings",
    icon: Settings,
    section: RouteSection.Secondary,
  },
  {
    title: "Book a call",
    titleKey: "bookACall",
    section: RouteSection.Secondary,
    pathname: "",
    menuNode: <BookACallButton />,
  },
  {
    title: "Support",
    titleKey: "support",
    icon: LifeBuoy,
    section: RouteSection.Secondary,
    pathname: "", // Empty pathname since this is a dropdown
    menuNode: <SupportButton />,
  },
];

function CommandMenuTrigger() {
  const { setOpen } = useCommandMenu();
  const capture = usePostHogClientCapture();
  const t = useTranslations("navigation.items");

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
      {t("goTo")}
      <span className="ml-auto hidden md:inline-flex">
        <KeyboardShortcut keys={["Mod", "K"]} />
      </span>
    </SidebarMenuButton>
  );
}
