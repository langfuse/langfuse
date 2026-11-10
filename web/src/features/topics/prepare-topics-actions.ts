import {
  Eye,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  type IconComponent,
} from "@langfuse/icons";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type TopicAction = {
  id: "edit" | "new-analysis" | "regenerate" | "configure" | "history";
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  disabledReason?: string;
  badge?: string;
};

function newAnalysisDisabledReason(
  canWrite: boolean,
  state: AutomaticProcessingState,
) {
  if (!canWrite) return "You need permission to edit Topics.";
  if (state.status === "unconfigured") return "Configure Topics first.";
  return undefined;
}

/** One action policy for the header button and both overflow-menu presentations. */
export function prepareTopicsActions({
  automaticProcessing,
  canWrite,
  configureAvailable,
  regenerateAvailable,
  menuOnly,
  onConfigure,
  onRegenerate,
  onHistory,
  onNewAnalysis,
  onEditRun,
  showUnassigned,
  onShowUnassignedChange,
}: {
  automaticProcessing: { state: AutomaticProcessingState; saving: boolean };
  canWrite: boolean;
  configureAvailable: boolean;
  regenerateAvailable: boolean;
  menuOnly: boolean;
  onConfigure: () => void;
  onRegenerate: () => void;
  onHistory: () => void;
  /** Starts a one-off analysis; absent where none can start. */
  onNewAnalysis?: () => void;
  /** Edits the selected live run; absent for past runs or without write access. */
  onEditRun?: () => void;
  showUnassigned: boolean;
  onShowUnassignedChange: (show: boolean) => void;
}) {
  const { state } = automaticProcessing;
  const menu: TopicAction[] = [];
  if (onEditRun)
    menu.push({
      id: "edit",
      label: "Edit run",
      icon: Pencil,
      onSelect: onEditRun,
    });
  menu.push(
    {
      id: "regenerate",
      label: "Regenerate topics",
      icon: RefreshCw,
      disabledReason: regenerateAvailable
        ? undefined
        : "Configure Topics first.",
      onSelect: onRegenerate,
    },
    {
      id: "history",
      label: "History",
      icon: History,
      onSelect: onHistory,
    },
    {
      id: "configure",
      label: "Configure Topics",
      icon: Settings,
      disabledReason: configureAvailable
        ? undefined
        : "Topics settings are still loading.",
      onSelect: onConfigure,
    },
  );
  const display = {
    id: "show-unassigned",
    label: "Show unassigned",
    icon: Eye,
    checked: showUnassigned,
    onCheckedChange: onShowUnassignedChange,
  } as const;
  const newAnalysis = onNewAnalysis
    ? {
        onSelect: onNewAnalysis,
        disabledReason: newAnalysisDisabledReason(canWrite, state),
      }
    : null;
  // Handheld headers show only the menu, so it carries New analysis there.
  if (menuOnly && newAnalysis)
    menu.splice(onEditRun ? 1 : 0, 0, {
      id: "new-analysis",
      label: "New analysis",
      icon: Plus,
      disabledReason: newAnalysis.disabledReason,
      onSelect: newAnalysis.onSelect,
    });
  return { newAnalysis: menuOnly ? null : newAnalysis, menu, display };
}

export type TopicsActions = ReturnType<typeof prepareTopicsActions>;
