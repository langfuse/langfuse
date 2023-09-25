import { env } from "@/src/env.mjs";
import {
  Database,
  FlaskConical,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  ListTree,
  Settings,
  TextSelect,
  UsersIcon,
} from "lucide-react";

export const ROUTES = [
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
  ...(env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_FEATURES === "true"
    ? [
        {
          name: "Datasets",
          pathname: `/project/[projectId]/datasets`,
          icon: Database,
        },
      ]
    : []),
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
