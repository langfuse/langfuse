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
} from "lucide-react";
import { type ReactNode } from "react";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type UiCustomizationOption } from "@/src/ee/features/ui-customization/useUiCustomization";
import { type User } from "next-auth";
import { type OrganizationScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { SupportMenuDropdown } from "@/src/components/nav/support-menu-dropdown";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

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
  bottom?: boolean; // bottom of the sidebar, only for first level routes
  newTab?: boolean; // open in new tab
  entitlements?: Entitlement[]; // entitlements required, array treated as OR
  customizableHref?: UiCustomizationOption; // key of useUiCustomization object to use to replace the href
  show?: (p: {
    organization: User["organizations"][number] | undefined;
  }) => boolean;
};

export const ROUTES: Route[] = [
  {
    title: "Go to...",
    pathname: "", // Empty pathname since this is a dropdown
    icon: Search,
    menuNode: <CommandMenuTrigger />,
  },
  {
    title: "Organizations",
    pathname: "/",
    icon: Grid2X2,
    show: ({ organization }) => organization === undefined,
  },
  {
    title: "Projects",
    pathname: "/organization/[organizationId]",
    icon: Grid2X2,
  },
  {
    title: "Dashboard",
    pathname: `/project/[projectId]`,
    icon: LayoutDashboard,
  },
  {
    title: "Tracing",
    pathname: `/project/[projectId]/traces`,
    icon: ListTree,
    items: [
      {
        title: "Traces",
        pathname: `/project/[projectId]/traces`,
      },
      {
        title: "Sessions",
        pathname: `/project/[projectId]/sessions`,
      },
      {
        title: "Observations",
        pathname: `/project/[projectId]/observations`,
      },
      {
        title: "Scores",
        pathname: `/project/[projectId]/scores`,
      },
    ],
  },
  {
    title: "Evaluation",
    icon: Lightbulb,
    pathname: `/project/[projectId]/annotation-queues`,
    entitlements: ["annotation-queues", "model-based-evaluations"],
    projectRbacScopes: ["annotationQueues:read", "evalJob:read"],
    items: [
      {
        title: "Human Annotation",
        pathname: `/project/[projectId]/annotation-queues`,
        projectRbacScopes: ["annotationQueues:read"],
        entitlements: ["annotation-queues"],
      },
      {
        title: "LLM-as-a-Judge",
        pathname: `/project/[projectId]/evals`,
        entitlements: ["model-based-evaluations"],
        projectRbacScopes: ["evalJob:read"],
      },
    ],
  },
  {
    title: "Users",
    pathname: `/project/[projectId]/users`,
    icon: UsersIcon,
  },
  {
    title: "Prompts",
    pathname: "/project/[projectId]/prompts",
    icon: FileJson,
    projectRbacScopes: ["prompts:read"],
  },
  {
    title: "Playground",
    pathname: "/project/[projectId]/playground",
    icon: TerminalIcon,
    entitlements: ["playground"],
  },
  {
    title: "Datasets",
    pathname: `/project/[projectId]/datasets`,
    icon: Database,
  },
  {
    title: "Upgrade",
    icon: Sparkle,
    pathname: "/project/[projectId]/settings/billing",
    bottom: true,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "Upgrade",
    icon: Sparkle,
    pathname: "/organization/[organizationId]/settings/billing",
    bottom: true,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
  },
  {
    title: "Settings",
    pathname: "/project/[projectId]/settings",
    icon: Settings,
    bottom: true,
  },
  {
    title: "Settings",
    pathname: "/organization/[organizationId]/settings",
    icon: Settings,
    bottom: true,
  },
  {
    title: "Support",
    icon: LifeBuoy,
    bottom: true,
    pathname: "", // Empty pathname since this is a dropdown
    menuNode: <SupportMenuDropdown />,
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
