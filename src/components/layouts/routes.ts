import { type Flag } from "@/src/features/feature-flags/types";
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
  AlertCircle,
} from "lucide-react";

export const ROUTES: Array<{
  name: string;
  pathname: string;
  icon: LucideIcon;
  featureFlag?: Flag;
  label?: string;
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
    name: "Datasets",
    pathname: `/project/[projectId]/datasets`,
    icon: Database,
  },
  {
    name: "Alerts",
    pathname: "/project/[projectId]/alerts",
    icon: AlertCircle,
    featureFlag: "costAlerts",
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
