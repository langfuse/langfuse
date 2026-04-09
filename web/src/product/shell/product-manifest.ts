import {
  Activity,
  BarChart2,
  BadgeCheck,
  CloudUpload,
  FileJson,
  FilePenLine,
  FlaskConical,
  Folder,
  MessageSquareReply,
  Route,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { type ShellBreadcrumbItem } from "./Breadcrumbs";

export type ProjectPrimarySection = "overview";

export type WorkspaceNodeKind = "folder" | "prompt";

export type PromptStage = "iterate" | "evaluate" | "monitor" | "deploy";

export type PromptStageLink = {
  value: PromptStage;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type ShellRoute = {
  id: string;
  title: string;
  section: ProjectPrimarySection;
  kind: "page" | "prompt-stage" | "workspace-node";
  href: string;
};

export type ProductNavItem = ShellRoute & {
  icon: LucideIcon;
};

export type WorkspacePreviewNode = {
  kind: WorkspaceNodeKind;
  name: string;
  pathSegments: string[];
  icon?: LucideIcon;
  children?: WorkspacePreviewNode[];
};

export const PROMPT_STAGES: PromptStage[] = [
  "iterate",
  "evaluate",
  "deploy",
  "monitor",
];

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
        icon: ShieldAlert,
      },
      {
        kind: "prompt",
        name: "reply-drafter",
        pathSegments: ["support", "reply-drafter"],
        icon: MessageSquareReply,
      },
      {
        kind: "prompt",
        name: "priority-router",
        pathSegments: ["support", "priority-router"],
        icon: Route,
      },
      {
        kind: "prompt",
        name: "resolution-checker",
        pathSegments: ["support", "resolution-checker"],
        icon: BadgeCheck,
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
  ];
}

export function getWorkspacePreviewNodes() {
  return PREVIEW_WORKSPACE_NODES;
}

export function getPromptStageTabs(
  projectId: string,
  promptPath: string[],
): PromptStageLink[] {
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

export function getWorkspaceSelectionLabel(pathSegments: string[]) {
  return humanizeSegment(pathSegments.at(-1) ?? "Workspace");
}

export function getTreeIcon(
  kind: WorkspaceNodeKind,
  icon?: LucideIcon,
): LucideIcon {
  if (icon) {
    return icon;
  }

  switch (kind) {
    case "prompt":
      return FileJson;
    case "folder":
    default:
      return Folder;
  }
}
