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
  FileJson,
} from "lucide-react";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { type ReactNode } from "react";
import { VersionLabel } from "@/src/components/VersionLabel";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { type UiCustomizationOption } from "@/src/ee/features/ui-customization/useUiCustomization";
import { type User } from "next-auth";
import { type OrganizationScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { UsageTracker } from "@/src/ee/features/billing/components/UsageTracker";

export type Route = {
  name: string;
  featureFlag?: Flag;
  label?: string | ReactNode;
  projectRbacScopes?: ProjectScope[]; // array treated as OR
  organizationRbacScope?: OrganizationScope;
  icon?: LucideIcon | typeof LangfuseIcon; // ignored for nested routes
  pathname?: string; // link, ignored if children
  children?: Array<Route>; // folder
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
    name: "Langfuse",
    pathname: "/",
    icon: LangfuseIcon,
    label: <VersionLabel className="-ml-3" />,
    // node is overridden in layout.tsx if uiCustomization.logoLightModeHref and uiCustomization.logoDarkModeHref are set
  },
  {
    name: "Projects",
    pathname: "/organization/[organizationId]",
    icon: Grid2X2,
  },
  {
    name: "Dashboard",
    pathname: `/project/[projectId]`,
    icon: LayoutDashboard,
  },
  {
    name: "Tracing",
    icon: ListTree,
    children: [
      {
        name: "Traces",
        pathname: `/project/[projectId]/traces`,
      },
      {
        name: "Sessions",
        pathname: `/project/[projectId]/sessions`,
      },
      {
        name: "Generations",
        pathname: `/project/[projectId]/generations`,
      },
      {
        name: "Scores",
        pathname: `/project/[projectId]/scores`,
      },
      {
        name: "Models",
        pathname: `/project/[projectId]/models`,
      },
    ],
  },
  {
    name: "Evaluation",
    pathname: `/project/[projectId]/evals/configs`,
    icon: Lightbulb,
    label: "Beta",
    entitlements: ["annotation-queues", "model-based-evaluations"],
    projectRbacScopes: ["annotationQueues:read", "evalJob:read"],
    children: [
      {
        name: "Human Annotation",
        pathname: `/project/[projectId]/annotation-queues`,
        projectRbacScopes: ["annotationQueues:read"],
        entitlements: ["annotation-queues"],
      },
      {
        name: "LLM-as-a-Judge",
        pathname: `/project/[projectId]/evals`,
        entitlements: ["model-based-evaluations"],
        projectRbacScopes: ["evalJob:read"],
      },
    ],
  },
  {
    name: "Users",
    pathname: `/project/[projectId]/users`,
    icon: UsersIcon,
  },
  {
    name: "Prompts",
    pathname: "/project/[projectId]/prompts",
    icon: FileJson,
    projectRbacScopes: ["prompts:read"],
  },
  {
    name: "Playground",
    pathname: "/project/[projectId]/playground",
    icon: TerminalIcon,
    entitlements: ["playground"],
  },
  {
    name: "Datasets",
    pathname: `/project/[projectId]/datasets`,
    icon: Database,
  },
  {
    name: "Upgrade",
    icon: Sparkle,
    pathname: "/project/[projectId]/settings/billing",
    bottom: true,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
    label: <UsageTracker />,
  },
  {
    name: "Upgrade",
    icon: Sparkle,
    pathname: "/organization/[organizationId]/settings/billing",
    bottom: true,
    entitlements: ["cloud-billing"],
    organizationRbacScope: "langfuseCloudBilling:CRUD",
    show: ({ organization }) => organization?.plan === "cloud:hobby",
    label: <UsageTracker />,
  },
  {
    name: "Settings",
    pathname: "/project/[projectId]/settings",
    icon: Settings,
    bottom: true,
  },
  {
    name: "Settings",
    pathname: "/organization/[organizationId]/settings",
    icon: Settings,
    bottom: true,
  },
  {
    name: "Docs",
    pathname: "https://langfuse.com/docs",
    icon: LibraryBig,
    bottom: true,
    newTab: true,
    customizableHref: "documentationHref",
  },
  {
    name: "Support",
    pathname: "/support",
    icon: LifeBuoy,
    bottom: true,
    customizableHref: "supportHref",
  },
];
