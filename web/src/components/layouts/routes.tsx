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
  PenSquareIcon,
  LibraryBig,
  TerminalIcon,
  Lightbulb,
  Grid2X2,
} from "lucide-react";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { type ReactNode } from "react";
import { VersionLabel } from "@/src/components/VersionLabel";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";

export type Route = {
  name: string;
  featureFlag?: Flag;
  label?: string | ReactNode;
  projectRbacScope?: ProjectScope;
  icon?: LucideIcon | typeof LangfuseIcon; // ignored for nested routes
  pathname?: string; // link, ignored if children
  children?: Array<Route>; // folder
  bottom?: boolean; // bottom of the sidebar, only for first level routes
  newTab?: boolean; // open in new tab
  entitlement?: Entitlement; // entitlement required
};

export const ROUTES: Route[] = [
  {
    name: "Langfuse",
    pathname: "/",
    icon: LangfuseIcon,
    label: <VersionLabel />,
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
    icon: Lightbulb,
    entitlement: "model-based-evaluations",
    label: "Beta",
    children: [
      {
        name: "Templates",
        pathname: `/project/[projectId]/evals/templates`,
        entitlement: "model-based-evaluations",
        projectRbacScope: "evalTemplate:read",
      },
      {
        name: "Configs",
        pathname: `/project/[projectId]/evals/configs`,
        entitlement: "model-based-evaluations",
        projectRbacScope: "evalJob:read",
      },
      {
        name: "Log",
        pathname: `/project/[projectId]/evals/log`,
        entitlement: "model-based-evaluations",
        projectRbacScope: "evalJobExecution:read",
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
    icon: PenSquareIcon,
    projectRbacScope: "prompts:read",
  },
  {
    name: "Playground",
    pathname: "/project/[projectId]/playground",
    icon: TerminalIcon,
    entitlement: "playground",
  },
  {
    name: "Datasets",
    pathname: `/project/[projectId]/datasets`,
    icon: Database,
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
  },
  {
    name: "Support",
    pathname: "/support",
    icon: LifeBuoy,
    bottom: true,
  },
];
