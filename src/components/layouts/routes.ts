import { type Flag } from "@/src/features/feature-flags/types";
import { type Scope } from "@/src/features/rbac/constants/roleAccessRights";
import {
  Database,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  ListTree,
  type LucideIcon,
  Settings,
  TextSelect,
  UsersIcon,
  Route,
  PenSquareIcon,
} from "lucide-react";

export const ROUTES: Array<{
  name: string;
  pathname: string;
  icon: LucideIcon;
  featureFlag?: Flag;
  label?: string;
  rbacScope?: Scope;
}> = [
  {
    name: "Dashboard",
    pathname: `/project/[projectId]`,
    icon: LayoutDashboard,
  },
  {
    name: "Sessions",
    pathname: `/project/[projectId]/sessions`,
    icon: Route,
  },
  {
    name: "Traces",
    pathname: `/project/[projectId]/traces`,
    icon: ListTree,
  },
  {
    name: "Generations",
    pathname: `/project/[projectId]/generations`,
    icon: TextSelect,
  },
  {
    name: "Scores",
    pathname: `/project/[projectId]/scores`,
    icon: LineChart,
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
