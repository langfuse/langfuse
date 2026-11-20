import {
  AppWindow,
  Beaker,
  Clock,
  Database,
  FileJson,
  LayoutDashboard,
  ListTree,
  Waypoints,
  type IconComponent,
} from "@langfuse/icons";

import {
  getInAppAgentScreenContextDescription,
  type InAppAgentScreenContextDescription,
} from "@/src/features/in-app-agent/context";
import { getInAppAgentProjectRoute } from "@/src/features/in-app-agent/routeContext";

export type InAppAgentPageContext = {
  /** Names the page on a message that was sent from it. */
  label: string;
  /** Names the page while it is the one on screen. */
  currentLabel: string;
  icon: IconComponent;
  /** What Halo reads from the page, for an empty conversation. */
  visibility: string;
  placeholder: string;
};

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function entityPage(noun: string, icon: IconComponent): InAppAgentPageContext {
  return {
    label: capitalize(noun),
    currentLabel: `This ${noun}`,
    icon,
    visibility: `Halo can see the ${noun} you have open.`,
    placeholder: `Ask about this ${noun}…`,
  };
}

function listPage(plural: string, icon: IconComponent): InAppAgentPageContext {
  return {
    label: capitalize(plural),
    currentLabel: capitalize(plural),
    icon,
    visibility: `Halo can see the list of ${plural} you have open.`,
    placeholder: `Ask about these ${plural}…`,
  };
}

const HOME_PAGE: InAppAgentPageContext = {
  label: "Langfuse Home",
  currentLabel: "Langfuse Home",
  icon: LayoutDashboard,
  visibility: "Halo can see the Home page you have open.",
  placeholder: "Ask about your traces, costs or scores…",
};

const PAGES: Record<
  Exclude<InAppAgentScreenContextDescription["type"], "page">,
  InAppAgentPageContext
> = {
  trace: entityPage("trace", ListTree),
  observation: entityPage("observation", ListTree),
  prompt: entityPage("prompt", FileJson),
  session: entityPage("session", Clock),
  dataset: entityPage("dataset", Database),
  datasetItem: entityPage("dataset item", Database),
  experimentRun: entityPage("experiment run", Beaker),
  "trace-list": listPage("traces", ListTree),
  "observations-list": listPage("observations", ListTree),
  "sessions-list": listPage("sessions", Clock),
  "prompts-list": listPage("prompts", FileJson),
  "datasets-list": listPage("datasets", Database),
  topics: {
    label: "Topics",
    currentLabel: "Topics",
    icon: Waypoints,
    visibility: "Halo can see the topics you have open.",
    placeholder: "Ask about these topics…",
  },
};

function isProjectHome(path: string) {
  try {
    const segments = new URL(path, "https://langfuse.local").pathname
      .split("/")
      .filter(Boolean);
    const projectIndex = segments.indexOf("project");

    return projectIndex !== -1 && segments.length === projectIndex + 2;
  } catch {
    return false;
  }
}

/**
 * How the assistant names a page to the user. `description` overrides the
 * classification of `path` where the caller knows more, e.g. missing access.
 */
export function getInAppAgentPageContext(
  path: string | undefined,
  description: InAppAgentScreenContextDescription = path
    ? getInAppAgentScreenContextDescription(path)
    : { type: "page" },
): InAppAgentPageContext {
  if (description.type !== "page") {
    return PAGES[description.type];
  }

  if (path && isProjectHome(path)) {
    return HOME_PAGE;
  }

  const [section, detailId] = path
    ? (getInAppAgentProjectRoute(path)?.routeSegments ?? [])
    : [];

  if (section === "dashboards" && detailId) {
    return entityPage("dashboard", LayoutDashboard);
  }

  const sectionName =
    section && /^[a-z][a-z-]*$/.test(section)
      ? capitalize(section.replaceAll("-", " "))
      : undefined;

  return {
    label: sectionName ?? "Page",
    currentLabel: sectionName ?? "This page",
    icon: AppWindow,
    visibility: "Halo can see the page you have open.",
    placeholder: "Ask about this page…",
  };
}
