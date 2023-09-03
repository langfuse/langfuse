import {
  FlaskConical,
  HelpingHand,
  LayoutDashboard,
  LineChart,
  ListTree,
  Settings,
  TextSelect,
  UsersIcon,
  
} from "lucide-react";
import { BuildingLibraryIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/solid";

export const ROUTES = [
  {
    name: "Dashboard",
    pathname: `/project/[projectId]`,
    icon: LayoutDashboard,
  },
  {
    name: "Truth Tables",
    pathname: `/project/[projectId]/knowledge`,
    icon: BuildingLibraryIcon,
  },
  {
    name: "Docks",
    pathname: `/project/[projectId]/docks/`,
    icon: WrenchScrewdriverIcon,
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
    name: "Settings",
    pathname: "/project/[projectId]/settings",
    icon: Settings,
  },
  {
    name: "Talk to Us",
    pathname: "https://office.next-boss.eu/index.php/apps/appointments/pub/e3Hdvp4BAg%3D%3D/form",
    icon: HelpingHand,
  },
];
