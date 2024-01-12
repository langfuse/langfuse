import { type Flag } from "@/src/features/feature-flags/types";
import { type Scope } from "@/src/features/rbac/constants/roleAccessRights";
import { ChartBarIcon } from "@heroicons/react/20/solid";
import {
  Database,
  LayoutDashboard,
  LifeBuoy,
  ListTree,
  type LucideIcon,
  Settings,
  UsersIcon,
  PenSquareIcon,
} from "lucide-react";

export type Route = {
  name: string;
  featureFlag?: Flag;
  label?: string;
  rbacScope?: Scope;
  icon?: LucideIcon; // ignored for nested routes
  pathname?: string; // link, ignored if children
  children?: Array<Route>; // folder
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
    label: "Beta",
    rbacScope: "prompts:read",
  },
  {
    name: "Datasets",
    pathname: `/project/[projectId]/datasets`,
    icon: Database,
  },
  {
    name: "Analytics",
    pathname: `/project/[projectId]/analytics`,
    icon: ChartBarIcon,
  },
  {
    name: "Settings",
    pathname: "/project/[projectId]/settings",
    icon: Settings,
  },
  {
    name: "Support",
    pathname: "/project/[projectId]/support",
    icon: LifeBuoy,
  },
];
