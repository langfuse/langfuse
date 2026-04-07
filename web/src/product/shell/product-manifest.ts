import {
  Activity,
  ArrowUpRight,
  BarChart2,
  CloudUpload,
  Database,
  FileJson,
  FilePenLine,
  FlaskConical,
  Folder,
  Home,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { type ShellBreadcrumbItem } from "./Breadcrumbs";
import { type PromptStageTab } from "./PromptStageTabs";

export type ProjectPrimarySection = "overview" | "workspace" | "instrument";

export type WorkspaceNodeKind = "folder" | "prompt" | "dataset";

export type PromptStage = "iterate" | "evaluate" | "monitor" | "deploy";

export type ShellRoute = {
  id: string;
  title: string;
  section: ProjectPrimarySection | "organization";
  kind: "page" | "prompt-stage" | "workspace-node";
  href: string;
};

export type ProductNavItem = ShellRoute & {
  icon: LucideIcon;
};

export type UtilityNavItem = {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
};

export type WorkspacePreviewNode = {
  kind: WorkspaceNodeKind;
  name: string;
  pathSegments: string[];
  children?: WorkspacePreviewNode[];
};

export const PROMPT_STAGES: PromptStage[] = [
  "iterate",
  "evaluate",
  "monitor",
  "deploy",
];

export const PLACEHOLDER_COPY = {
  organizationMonitor:
    "Cross-project monitoring, portfolio health, and organization-level quality signals will land here once the shell is approved.",
  projectOverview:
    "This becomes the canonical project landing page. Project-level charts, cards, and monitoring summaries will replace the current placeholder in later phases.",
  workspaceHome:
    "This is the root of the docs-like workspace. Folders, prompts, and datasets will eventually be browsable and actionable from here.",
  workspaceFolder:
    "Folder pages prove the workspace path model and breadcrumb behavior. Real folder contents come in the next phase.",
  promptIterate:
    "Prompt authoring, prompt versions, playground entry points, variables, and tools will be re-homed into this stage.",
  promptEvaluate:
    "Datasets, experiments, evaluators, scores, and annotation workflows will be grouped here around a selected prompt.",
  promptMonitor:
    "Prompt-scoped traces, spans, and charts will live here while preserving the prompt selection across the lifecycle.",
  promptDeploy:
    "Deploy stays intentionally thin in phase 1. Existing Langfuse prompt version and label concepts will be re-homed here first.",
  dataset:
    "Datasets stay as peer workspace assets. This page validates that they open outside prompt tabs while still living inside the workspace shell.",
  instrument:
    "Instrumentation setup, API keys, and tracing onboarding will move here as the dedicated project setup surface.",
} as const;

const PREVIEW_WORKSPACE_NODES: WorkspacePreviewNode[] = [
  {
    kind: "folder",
    name: "support",
    pathSegments: ["support"],
    children: [
      {
        kind: "prompt",
        name: "triage-agent",
        pathSegments: ["support", "triage-agent"],
      },
      {
        kind: "prompt",
        name: "reply-drafter",
        pathSegments: ["support", "reply-drafter"],
      },
      {
        kind: "dataset",
        name: "golden-cases",
        pathSegments: ["support", "golden-cases"],
      },
    ],
  },
  {
    kind: "folder",
    name: "release-ops",
    pathSegments: ["release-ops"],
    children: [
      {
        kind: "prompt",
        name: "release-summary",
        pathSegments: ["release-ops", "release-summary"],
      },
      {
        kind: "dataset",
        name: "regression-cases",
        pathSegments: ["release-ops", "regression-cases"],
      },
    ],
  },
];

export function decodePathSegments(
  value: string | string[] | undefined,
): string[] {
  if (!value) {
    return [];
  }

  const parts = Array.isArray(value) ? value : [value];
  return parts.map((part) => decodeURIComponent(part)).filter(Boolean);
}

export function humanizeSegment(segment: string) {
  const normalized = decodeURIComponent(segment).replace(/[-_]/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getProjectPreviewHref(projectId: string) {
  return `/project/${projectId}/greenfield`;
}

export function getWorkspacePreviewHref(projectId: string) {
  return `${getProjectPreviewHref(projectId)}/workspace`;
}

export function getFolderPreviewHref(projectId: string, folderPath: string[]) {
  return `${getWorkspacePreviewHref(projectId)}/folder/${folderPath.map(encodeURIComponent).join("/")}`;
}

export function getPromptStageHref(
  projectId: string,
  promptPath: string[],
  stage: PromptStage,
) {
  return `${getWorkspacePreviewHref(projectId)}/prompt/${promptPath.map(encodeURIComponent).join("/")}/${stage}`;
}

export function getDatasetPreviewHref(
  projectId: string,
  datasetPath: string[],
) {
  return `${getWorkspacePreviewHref(projectId)}/dataset/${datasetPath.map(encodeURIComponent).join("/")}`;
}

export function getInstrumentPreviewHref(projectId: string) {
  return `${getProjectPreviewHref(projectId)}/instrument`;
}

export function getOrganizationPreviewHref(organizationId: string) {
  return `/organization/${organizationId}/greenfield`;
}

export function getProjectPrimaryNav(projectId: string): ProductNavItem[] {
  return [
    {
      id: "overview",
      title: "Overview",
      section: "overview",
      kind: "page",
      href: getProjectPreviewHref(projectId),
      icon: BarChart2,
    },
    {
      id: "workspace",
      title: "Workspace",
      section: "workspace",
      kind: "page",
      href: getWorkspacePreviewHref(projectId),
      icon: Home,
    },
    {
      id: "instrument",
      title: "Instrument",
      section: "instrument",
      kind: "page",
      href: getInstrumentPreviewHref(projectId),
      icon: Wrench,
    },
  ];
}

export function getOrganizationPrimaryNav(
  organizationId: string,
): ProductNavItem[] {
  return [
    {
      id: "organization-monitor",
      title: "Monitor",
      section: "organization",
      kind: "page",
      href: getOrganizationPreviewHref(organizationId),
      icon: BarChart2,
    },
  ];
}

export function getProjectUtilityNav(projectId: string): UtilityNavItem[] {
  return [
    {
      id: "live-app",
      title: "Live app",
      href: `/project/${projectId}`,
      icon: ArrowUpRight,
    },
    {
      id: "settings",
      title: "Settings",
      href: `/project/${projectId}/settings`,
      icon: Settings,
    },
  ];
}

export function getOrganizationUtilityNav(
  organizationId: string,
): UtilityNavItem[] {
  return [
    {
      id: "live-app",
      title: "Live app",
      href: `/organization/${organizationId}`,
      icon: ArrowUpRight,
    },
    {
      id: "settings",
      title: "Settings",
      href: `/organization/${organizationId}/settings`,
      icon: Settings,
    },
  ];
}

export function getWorkspacePreviewNodes() {
  return PREVIEW_WORKSPACE_NODES;
}

export function getPromptStageTabs(
  projectId: string,
  promptPath: string[],
): PromptStageTab[] {
  const stageIcons = {
    iterate: FilePenLine,
    evaluate: FlaskConical,
    monitor: Activity,
    deploy: CloudUpload,
  } as const;

  return PROMPT_STAGES.map((stage) => ({
    value: stage,
    label: humanizeSegment(stage),
    href: getPromptStageHref(projectId, promptPath, stage),
    icon: stageIcons[stage],
  }));
}

export function resolvePromptPreviewSlug(
  value: string | string[] | undefined,
): {
  promptPath: string[];
  stage: PromptStage;
} {
  const segments = decodePathSegments(value);
  const maybeStage = segments.at(-1);

  if (maybeStage && PROMPT_STAGES.includes(maybeStage as PromptStage)) {
    return {
      promptPath: segments.slice(0, -1),
      stage: maybeStage as PromptStage,
    };
  }

  return {
    promptPath: segments,
    stage: "iterate",
  };
}

export function getProjectOverviewBreadcrumbs(
  projectId: string,
): ShellBreadcrumbItem[] {
  return [
    {
      name: "Project",
      href: getProjectPreviewHref(projectId),
    },
    {
      name: "Overview",
    },
  ];
}

export function getWorkspaceBreadcrumbs(
  projectId: string,
  folderPath: string[],
): ShellBreadcrumbItem[] {
  const crumbs: ShellBreadcrumbItem[] = [
    {
      name: "Project",
      href: getProjectPreviewHref(projectId),
    },
    {
      name: "Workspace",
      href: getWorkspacePreviewHref(projectId),
    },
  ];

  folderPath.forEach((segment, index) => {
    const path = folderPath.slice(0, index + 1);
    crumbs.push({
      name: humanizeSegment(segment),
      href:
        index === folderPath.length - 1
          ? undefined
          : getFolderPreviewHref(projectId, path),
    });
  });

  return crumbs;
}

export function getPromptBreadcrumbs(
  projectId: string,
  promptPath: string[],
): ShellBreadcrumbItem[] {
  const folderPath = promptPath.slice(0, -1);
  const promptName = promptPath.at(-1) ?? "Prompt";

  return [
    ...getWorkspaceBreadcrumbs(projectId, folderPath),
    {
      name: humanizeSegment(promptName),
    },
  ];
}

export function getDatasetBreadcrumbs(
  projectId: string,
  datasetPath: string[],
): ShellBreadcrumbItem[] {
  const folderPath = datasetPath.slice(0, -1);
  const datasetName = datasetPath.at(-1) ?? "Dataset";

  return [
    ...getWorkspaceBreadcrumbs(projectId, folderPath),
    {
      name: humanizeSegment(datasetName),
    },
  ];
}

export function getInstrumentBreadcrumbs(
  projectId: string,
): ShellBreadcrumbItem[] {
  return [
    {
      name: "Project",
      href: getProjectPreviewHref(projectId),
    },
    {
      name: "Instrument",
    },
  ];
}

export function getOrganizationMonitorBreadcrumbs(
  organizationId: string,
): ShellBreadcrumbItem[] {
  return [
    {
      name: "Organization",
      href: getOrganizationPreviewHref(organizationId),
    },
    {
      name: "Monitor",
    },
  ];
}

export function getWorkspaceSelectionLabel(pathSegments: string[]) {
  return humanizeSegment(pathSegments.at(-1) ?? "Workspace");
}

export function getTreeIcon(kind: WorkspaceNodeKind): LucideIcon {
  switch (kind) {
    case "dataset":
      return Database;
    case "prompt":
      return FileJson;
    case "folder":
    default:
      return Folder;
  }
}
