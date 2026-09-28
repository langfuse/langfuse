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
  FolderCode,
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
import { type OrganizationScope } from "@/src/features/rbac";
import { SupportButton } from "@/src/components/nav/support-button";
import { V4MigrationNavItem } from "@/src/features/v4-migration/V4MigrationNavItem";
import { V4SidebarToggle } from "@/src/features/events";
import { BookACallButton } from "@/src/components/nav/book-a-call-button";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { CloudStatusMenu } from "@/src/features/cloud-status-notification/components/CloudStatusMenu";
import { type ProductModule } from "@/src/ee/features/ui-customization/productModuleSchema";
import { matchesPathname } from "@/src/components/layouts/app-layout/utils/pathClassification";

export enum RouteSection {
  Main = "main",
  Secondary = "secondary",
}

export enum RouteGroup {
  Observability = "Observability",
  PromptManagement = "Prompt Management",
  ContextManagement = "Context Management",
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
  href: string;
  isActive?: (pathname: string) => boolean;
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
    hasActiveCloudIncident: boolean;
    canToggleV4: boolean;
    forceV3Experience: boolean;
    v4WriteMode: undefined | "legacy" | "dual" | "events_only"; // undefined until the session has loaded
    v4UpgradeUiAvailable: boolean; // deployment shows the v4 migration UI (see isV4UpgradeUiAvailable)
  }) => boolean;
  group?: RouteGroup; // group this route belongs to (within a section)
};

export const ROUTES: Route[] = [
  {
    title: "Go to...",
    href: "", // Empty pathname since this is a dropdown
    icon: Search,
    menuNode: <CommandMenuTrigger />,
    section: RouteSection.Main,
  },
  {
    title: "Organizations",
    href: "/",
    icon: Grid2X2,
    show: ({ organization }) => organization === undefined,
    section: RouteSection.Main,
  },
  {
    title: "Projects",
    href: "/organization/[organizationId]",
    icon: Grid2X2,
    section: RouteSection.Main,
  },
  {
    title: "Home",
    href: `/project/[projectId]`,
    icon: Home,
    section: RouteSection.Main,
  },
  {
    title: "Dashboards",
    href: `/project/[projectId]/dashboards`,
    isActive: matchesPathname([
      `/project/[projectId]/dashboards`,
      `/project/[projectId]/widgets`,
    ]),
    icon: LayoutDashboard,
    productModule: "dashboards",
    section: RouteSection.Main,
  },
  {
    title: "Tracing",
    icon: ListTree,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
    href: `/project/[projectId]/traces`,
    isActive: matchesPathname([
      `/project/[projectId]/traces`,
      `/project/[projectId]/observations`,
    ]),
  },
  {
    title: "Sessions",
    icon: Clock,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
    href: `/project/[projectId]/sessions`,
  },
  {
    title: "Users",
    href: `/project/[projectId]/users`,
    icon: UsersIcon,
    productModule: "tracing",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
  },
  {
    title: "Topics",
    href: "/project/[projectId]/topics",
    icon: Grid2X2,
    featureFlag: "langfuseTopics",
    projectRbacScopes: ["topics:read"],
    group: RouteGroup.Observability,
    section: RouteSection.Main,
  },
  {
    title: "Alerts",
    href: "/project/[projectId]/alerts",
    icon: BellRing,
    projectRbacScopes: ["alerts:read"],
    show: ({ v4WriteMode }) => Boolean(v4WriteMode) && v4WriteMode !== "legacy",
    group: RouteGroup.Observability,
    section: RouteSection.Main,
  },
  {
    title: "Skills",
    featureFlag: "internalFeatures",
    href: "/project/[projectId]/skills",
    icon: FolderCode,
    projectRbacScopes: ["skills:read"],
    productModule: "prompt-management",
    group: RouteGroup.PromptManagement,
    section: RouteSection.Main,
  },
  {
    title: "Prompts",
    href: "/project/[projectId]/prompts",
    icon: FileJson,
    projectRbacScopes: ["prompts:read"],
    productModule: "prompt-management",
    group: RouteGroup.PromptManagement,
    section: RouteSection.Main,
  },
  {
    title: "Playground",
    href: "/project/[projectId]/playground",
    icon: TerminalIcon,
    productModule: "playground",
    group: RouteGroup.PromptManagement,
    section: RouteSection.Main,
  },
  {
    title: "Scores",
    href: `/project/[projectId]/scores`,
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    icon: SquarePercent,
  },
  {
    title: "Evaluators",
    icon: Lightbulb,
    productModule: "evaluation",
    projectRbacScopes: ["evaluator:read", "evaluationRule:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    href: `/project/[projectId]/evals`,
    legacyPathname: `/project/[projectId]/evals/legacy`,
  },
  {
    title: "Human Annotation",
    href: `/project/[projectId]/annotation-queues`,
    projectRbacScopes: ["annotationQueues:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
    icon: ClipboardPen,
  },
  {
    title: "Datasets",
    href: `/project/[projectId]/datasets`,
    icon: Database,
    productModule: "datasets",
    projectRbacScopes: ["datasets:read"],
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
  },
  {
    title: "Experiments",
    href: `/project/[projectId]/experiments`,
    icon: Beaker,
    featureFlag: "experimentsV4Enabled",
    group: RouteGroup.Evaluation,
    section: RouteSection.Main,
  },
  {
    // Keep Action required first in the secondary nav so it is not sandwiched
    // between regular items like Upgrade Plan and Settings.
    title: "Update",
    href: "",
    section: RouteSection.Secondary,
    show: ({ projectId, v4UpgradeUiAvailable }) =>
      v4UpgradeUiAvailable && projectId !== undefined,
    menuNode: <V4MigrationNavItem />,
  },
  {
    title: "Cloud Status",
    section: RouteSection.Secondary,
    href: "",
    show: ({ isLangfuseCloud, hasActiveCloudIncident }) =>
      isLangfuseCloud && hasActiveCloudIncident,
    menuNode: <CloudStatusMenu />,
  },
  {
    title: "V4 Preview",
    href: "",
    section: RouteSection.Secondary,
    featureFlag: "v4BetaToggleVisible",
    // v4-upgrade users get this toggle inside the migration panel instead.
    show: ({ canToggleV4, forceV3Experience, v4UpgradeUiAvailable }) =>
      canToggleV4 && (!v4UpgradeUiAvailable || forceV3Experience),
    menuNode: <V4SidebarToggle />,
  },
  {
    title: "Upgrade Plan",
    icon: Sparkle,
    href: "/project/[projectId]/settings/billing",
    section: RouteSection.Secondary,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "Upgrade Plan",
    icon: Sparkle,
    href: "/organization/[organizationId]/settings/billing",
    section: RouteSection.Secondary,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "Settings",
    href: "/project/[projectId]/settings",
    icon: Settings,
    section: RouteSection.Secondary,
  },
  {
    title: "Settings",
    href: "/organization/[organizationId]/settings",
    icon: Settings,
    section: RouteSection.Secondary,
  },
  {
    title: "Book a call",
    section: RouteSection.Secondary,
    href: "",
    menuNode: <BookACallButton />,
  },
  {
    title: "Support",
    icon: LifeBuoy,
    section: RouteSection.Secondary,
    href: "", // Empty pathname since this is a dropdown
    menuNode: <SupportButton />,
  },
];

function CommandMenuTrigger() {
  const { setOpen } = useCommandMenu();
  const capture = usePostHogClientCapture();

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
      Go to...
      <span className="ml-auto hidden md:inline-flex">
        <KeyboardShortcut keys={["Mod", "K"]} />
      </span>
    </SidebarMenuButton>
  );
}
