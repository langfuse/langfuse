import { type Flag } from "@/src/features/featureFlags/types";
import {
  Database,
  FlaskConical,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  ListTree,
  type LucideIcon,
  Settings,
  TextSelect,
  UsersIcon,
} from "lucide-react";

export const ROUTES: Array<{
  name: string;
  pathname: string;
  icon: LucideIcon;
  featureFlag?: Flag;
}> = [
  {
    name: "Dashboard",
    pathname: `/project/[projectId]`,
    icon: LayoutDashboard,
  },
  {
    name: "Analytics (alpha)",
    pathname: `/project/[projectId]/analytics`,
    icon: FlaskConical,
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
    featureFlag: "datasets",
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
