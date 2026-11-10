import { type Flag } from "@/src/features/feature-flags/types";
import { type ProjectScope } from "@langfuse/shared";
import {
  BellRing,
  Database,
  LayoutDashboard,
  LifeBuoy,
  ListTree,
  type IconComponent,
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
  Waypoints,
  Box,
  KeyRound,
  ArrowUpRight,
} from "@langfuse/icons";
import { useRouter } from "next/router";
import { type ReactNode } from "react";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type Session } from "next-auth";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { type OrganizationScope } from "@langfuse/shared/rbac";
import { SupportButton } from "@/src/components/nav/SupportButton";
import { V4SidebarToggle } from "@/src/features/events/components/V4SidebarToggle";
import { V4_PREVIEW_LABEL } from "@/src/features/events/lib/v4PreviewLabel";
import { BookACallButton } from "@/src/components/nav/BookACallButton";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { CloudStatusMenu } from "@/src/features/cloud-status-notification/components/CloudStatusMenu";
import { type ProductModule } from "@/src/ee/features/ui-customization/productModuleSchema";
import { matchesPathname } from "@/src/components/layouts/app-layout/utils/pathClassification";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import {
  GATEWAY_PAGE_SLUGS,
  type GatewayPageSlug,
} from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { gatewayPageSlugFromPath } from "@/src/features/ai-gateway/fns/gatewayUrls/gatewayPageSlugFromPath";
import { useGatewayKeyReminder } from "@/src/features/ai-gateway/hooks/useGatewayKeyReminder";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";

export enum RouteSection {
  Main = "main",
  Secondary = "secondary",
}

export enum RouteGroup {
  Observability = "Observability",
  ContextManagement = "Context management",
  Evaluation = "Evaluation",
  AiGateway = "AI Gateway",
  Infrastructure = "Infrastructure",
}

export const ROUTE_GROUP_BADGES: Partial<Record<RouteGroup, ReactNode>> = {
  [RouteGroup.AiGateway]: <FeatureReleaseStatus status="beta" />,
};

export type Route = {
  id?: "v4-migration" | "ai-gateway" | "gateway-ingestion-project";
  title: string;
  menuNode?: ReactNode;
  featureFlag?: Flag;
  label?: string | ReactNode;
  projectRbacScopes?: ProjectScope[]; // array treated as OR
  organizationRbacScope?: OrganizationScope;
  icon?: IconComponent; // ignored for nested routes
  href: string;
  isActive?: (pathname: string, asPath: string) => boolean;
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
    canViewTopics: boolean;
    visibleGatewayPages: Record<GatewayPageSlug, boolean>;
    isLangfuseCloud: boolean;
    hasActiveCloudIncident: boolean;
    canToggleV4: boolean;
    canRecoverV4: boolean;
    forceV3Experience: boolean;
    v4WriteMode: undefined | "legacy" | "dual" | "events_only"; // undefined until the session has loaded
    v4UpgradeUiAvailable: boolean; // deployment shows the v4 migration UI (see isV4UpgradeUiAvailable)
  }) => boolean;
  group?: RouteGroup; // group this route belongs to (within a section)
  gatewayPage?: GatewayPageSlug; // disabled until the gateway is set up
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
    title: "Projects",
    href: "/organization/[organizationId]",
    icon: Grid2X2,
    section: RouteSection.Main,
  },
  ...(
    [
      {
        title: "Overview",
        slug: GATEWAY_PAGE_SLUGS.overview,
        icon: Home,
      },
      {
        title: "Providers & Models",
        slug: GATEWAY_PAGE_SLUGS.models,
        icon: Box,
      },
      {
        title: "Gateway keys",
        slug: GATEWAY_PAGE_SLUGS.apiKeys,
        icon: KeyRound,
      },
    ] as const
  ).map(
    ({ title, slug, icon }): Route => ({
      title,
      href:
        slug === GATEWAY_PAGE_SLUGS.overview
          ? "/organization/[organizationId]/ai-gateway"
          : `/organization/[organizationId]/ai-gateway/${slug}`,
      icon,
      gatewayPage: slug,
      show: ({ visibleGatewayPages }) => visibleGatewayPages[slug],
      isActive: (_, asPath) => gatewayPageSlugFromPath(asPath) === slug,
      label:
        slug === GATEWAY_PAGE_SLUGS.apiKeys ? (
          <GatewayKeyReminderDot />
        ) : undefined,
      group: RouteGroup.AiGateway,
      section: RouteSection.Main,
    }),
  ),
  {
    // The URL is filled in from the gateway config; see useFilteredNavigation.
    title: "Tracing",
    id: "gateway-ingestion-project",
    href: "/project/[gatewayIngestionProjectId]/traces",
    icon: ListTree,
    show: ({ visibleGatewayPages }) =>
      visibleGatewayPages[GATEWAY_PAGE_SLUGS.models],
    label: <ArrowUpRight size="base" color="tertiary" aria-hidden />,
    group: RouteGroup.AiGateway,
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
    label: <TopicsInternalBadge />,
    show: ({ canViewTopics }) => canViewTopics,
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
    label: <FeatureReleaseStatus status="beta" />,
    href: "/project/[projectId]/skills",
    icon: FolderCode,
    projectRbacScopes: ["skills:read"],
    productModule: "prompt-management",
    group: RouteGroup.ContextManagement,
    section: RouteSection.Main,
  },
  {
    title: "Prompts",
    href: "/project/[projectId]/prompts",
    icon: FileJson,
    projectRbacScopes: ["prompts:read"],
    productModule: "prompt-management",
    group: RouteGroup.ContextManagement,
    section: RouteSection.Main,
  },
  {
    title: "Playground",
    href: "/project/[projectId]/playground",
    icon: TerminalIcon,
    productModule: "playground",
    group: RouteGroup.ContextManagement,
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
    title: "Human annotation",
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
    // The URL is the viewer's first AI Gateway page; see useFilteredNavigation.
    title: "AI Gateway",
    id: "ai-gateway",
    href: "",
    icon: Waypoints,
    show: ({ projectId }) => projectId !== undefined,
    label: <ArrowUpRight size="base" color="tertiary" aria-hidden />,
    group: RouteGroup.Infrastructure,
    section: RouteSection.Main,
  },
  {
    // Keep Action required first in the secondary nav so it is not sandwiched
    // between regular items like Upgrade plan and Settings.
    title: "Update",
    id: "v4-migration",
    href: "",
    section: RouteSection.Secondary,
    show: ({ projectId, v4UpgradeUiAvailable }) =>
      v4UpgradeUiAvailable && projectId !== undefined,
  },
  {
    title: "Cloud status",
    section: RouteSection.Secondary,
    href: "",
    show: ({ isLangfuseCloud, hasActiveCloudIncident }) =>
      isLangfuseCloud && hasActiveCloudIncident,
    menuNode: <CloudStatusMenu />,
  },
  {
    title: V4_PREVIEW_LABEL,
    href: "",
    section: RouteSection.Secondary,
    featureFlag: "v4BetaToggleVisible",
    // Recovery stays in the sidebar; ordinary opt-in lives in the migration panel.
    show: ({
      canToggleV4,
      canRecoverV4,
      forceV3Experience,
      v4UpgradeUiAvailable,
    }) =>
      canRecoverV4 ||
      (canToggleV4 && (!v4UpgradeUiAvailable || forceV3Experience)),
    menuNode: <V4SidebarToggle />,
  },
  {
    title: "Upgrade plan",
    icon: Sparkle,
    href: "/project/[projectId]/settings/billing",
    section: RouteSection.Secondary,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "Upgrade plan",
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
    show: ({ organization }) => showsOrganizationSettings(organization),
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

/** Gateway-only members without projects have no settings to open. */
function showsOrganizationSettings(
  organization:
    | NonNullable<Session["user"]>["organizations"][number]
    | undefined,
) {
  return (
    !organization ||
    hasOrganizationAccess({
      role: organization.role,
      scope: "organizationSettings:read",
    }) ||
    organization.projects.length > 0
  );
}

function GatewayKeyReminderDot() {
  const router = useRouter();
  const organizationId =
    typeof router.query.organizationId === "string"
      ? router.query.organizationId
      : undefined;
  const showReminder = useGatewayKeyReminder(organizationId);
  return showReminder ? (
    <span
      aria-label="Get your AI Gateway API key"
      className="size-1.75 shrink-0 rounded-full bg-orange-400"
    />
  ) : null;
}

function TopicsInternalBadge() {
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  return internalFeaturesEnabled ? (
    <FeatureReleaseStatus status="internal" />
  ) : null;
}

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
      <Search size="base" />
      Go to...
      <span className="-mr-px ml-auto hidden md:inline-flex">
        <KeyboardShortcut keys={["Mod", "K"]} />
      </span>
    </SidebarMenuButton>
  );
}
