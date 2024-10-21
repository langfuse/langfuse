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
  LibraryBig,
  TerminalIcon,
  Lightbulb,
  Grid2X2,
  Sparkle,
  ClipboardPen,
  FileJson,
} from "lucide-react";
import { type ReactNode } from "react";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type UiCustomizationOption } from "@/src/ee/features/ui-customization/useUiCustomization";
import { type User } from "next-auth";
import { type OrganizationScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { UsageTracker } from "@/src/ee/features/billing/components/UsageTracker";

export type Route = {
  title: string;
  featureFlag?: Flag;
  label?: string | ReactNode;
  projectRbacScope?: ProjectScope;
  organizationRbacScope?: OrganizationScope;
  icon?: LucideIcon; // ignored for nested routes
  pathname: string; // link
  items?: Array<Route>; // folder
  bottom?: boolean; // bottom of the sidebar, only for first level routes
  newTab?: boolean; // open in new tab
  entitlement?: Entitlement; // entitlement required
  customizableHref?: UiCustomizationOption; // key of useUiCustomization object to use to replace the href
  show?: (p: {
    organization: User["organizations"][number] | undefined;
  }) => boolean;
};

export const ROUTES: Route[] = [
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
        title: "Generations",
        pathname: `/project/[projectId]/generations`,
      },
      {
        title: "Scores",
        pathname: `/project/[projectId]/scores`,
      },
      {
        title: "Models",
        pathname: `/project/[projectId]/models`,
      },
    ],
  },
  {
    title: "Annotate",
    pathname: `/project/[projectId]/annotation-queues`,
    icon: ClipboardPen,
    label: "Beta",
    projectRbacScope: "annotationQueues:read",
    entitlement: "annotation-queues",
  },
  {
    title: "Evaluation",
    icon: Lightbulb,
    entitlement: "model-based-evaluations",
    label: "Beta",
    pathname: `/project/[projectId]/evals`,
    items: [
      {
        title: "Templates",
        pathname: `/project/[projectId]/evals/templates`,
        entitlement: "model-based-evaluations",
        projectRbacScope: "evalTemplate:read",
      },
      {
        title: "Configs",
        pathname: `/project/[projectId]/evals/configs`,
        entitlement: "model-based-evaluations",
        projectRbacScope: "evalJob:read",
      },
      {
        title: "Log",
        pathname: `/project/[projectId]/evals/log`,
        entitlement: "model-based-evaluations",
        projectRbacScope: "evalJobExecution:read",
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
    projectRbacScope: "prompts:read",
  },
  {
    title: "Playground",
    pathname: "/project/[projectId]/playground",
    icon: TerminalIcon,
    entitlement: "playground",
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
    entitlement: "cloud-billing",
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
    label: <UsageTracker />,
  },
  {
    title: "Upgrade",
    icon: Sparkle,
    pathname: "/organization/[organizationId]/settings/billing",
    bottom: true,
    entitlement: "cloud-billing",
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
    label: <UsageTracker />,
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
    title: "Docs",
    pathname: "https://langfuse.com/docs",
    icon: LibraryBig,
    bottom: true,
    newTab: true,
    customizableHref: "documentationHref",
  },
  {
    title: "Support",
    pathname: "/support",
    icon: LifeBuoy,
    bottom: true,
    customizableHref: "supportHref",
  },
];
