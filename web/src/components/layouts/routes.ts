import { type Flag } from "@/src/features/feature-flags/types";
import { type Scope } from "@/src/features/rbac/constants/roleAccessRights";
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
} from "lucide-react";

export type Route = {
  name: string;
  featureFlag?: Flag;
  label?: string;
  rbacScope?: Scope;
  icon?: LucideIcon; // ignored for nested routes
  pathname?: string; // link, ignored if children
  children?: Array<Route>; // folder
  bottom?: boolean; // bottom of the sidebar, only for first level routes
  newTab?: boolean; // open in new tab
  cloudOnly?: boolean; // only available in cloud
};

export const ROUTES: Route[] = [
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
      {
        name: "Templates",
        pathname: `/project/[projectId]/evals/templates`,
        cloudOnly: true,
      },
      {
        name: "Configs",
        pathname: `/project/[projectId]/evals/configs`,
        cloudOnly: true,
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
    rbacScope: "prompts:read",
  },
  {
    name: "Playground",
    pathname: "/project/[projectId]/playground",
    icon: TerminalIcon,
    featureFlag: "playground",
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
    name: "Docs",
    pathname: "https://langfuse.com/docs",
    icon: LibraryBig,
    bottom: true,
    newTab: true,
  },
  {
    name: "Support",
    pathname: "/project/[projectId]/support",
    icon: LifeBuoy,
    bottom: true,
  },
];
