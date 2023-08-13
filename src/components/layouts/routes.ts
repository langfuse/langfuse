import {
  Cog6ToothIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/20/solid";
import {
  BarChart3,
  HelpingHand,
  HomeIcon,
  LineChart,
  UsersIcon,
} from "lucide-react";

export const ROUTES = [
  {
    name: "Dashboard",
    pathname: `/project/[projectId]`,
    icon: HomeIcon,
  },
  {
    name: "Analytics (alpha)",
    pathname: `/project/[projectId]/analytics`,
    icon: BarChart3,
  },
  {
    name: "Traces",
    pathname: `/project/[projectId]/traces`,
    icon: UsersIcon,
  },
  {
    name: "Generations",
    pathname: `/project/[projectId]/generations`,
    icon: DocumentDuplicateIcon,
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
    name: "Settings",
    pathname: "/project/[projectId]/settings",
    icon: Cog6ToothIcon,
  },
  {
    name: "Talk to founder",
    pathname: "https://cal.com/marc-kl/langfuse-cloud",
    icon: HelpingHand,
  },
];
