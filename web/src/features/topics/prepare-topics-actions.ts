import {
  Eye,
  History,
  Pencil,
  Plus,
  Settings,
  type IconComponent,
} from "@langfuse/icons";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type TopicAction = {
  id: "edit" | "new-analysis" | "configure" | "history";
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  disabledReason?: string;
  badge?: string;
};

const NO_WRITE_ACCESS = "You need permission to edit Topics.";

function newAnalysisDisabledReason(
  canWrite: boolean,
  state: AutomaticProcessingState,
) {
  if (!canWrite) return NO_WRITE_ACCESS;
  if (state.status === "unconfigured") return "Set up Topics first.";
  return undefined;
}

/** One action policy for the Edit scan button and both overflow-menu presentations. */
export function prepareTopicsActions({
  automaticProcessing,
  canWrite,
  configureAvailable,
  menuOnly,
  onConfigure,
  onHistory,
  onNewAnalysis,
  onEditRun,
  showUnassigned,
  onShowUnassignedChange,
}: {
  automaticProcessing: { state: AutomaticProcessingState; saving: boolean };
  canWrite: boolean;
  configureAvailable: boolean;
  menuOnly: boolean;
  onConfigure: () => void;
  onHistory: () => void;
  /** Starts a one-off analysis; absent where none can start. */
  onNewAnalysis?: () => void;
  /** Opens the selected live run's settings; absent for past runs. */
  onEditRun?: () => void;
  showUnassigned: boolean;
  onShowUnassignedChange: (show: boolean) => void;
}) {
  const { state } = automaticProcessing;
  const editDisabledReason = canWrite ? undefined : NO_WRITE_ACCESS;
  const menu: TopicAction[] = [];
  // Handheld headers show only the menu, so it carries Edit scan there.
  if (onEditRun && menuOnly)
    menu.push({
      id: "edit",
      label: "Edit scan",
      icon: Pencil,
      disabledReason: editDisabledReason,
      onSelect: onEditRun,
    });
  menu.push(
    {
      id: "history",
      label: "History",
      icon: History,
      onSelect: onHistory,
    },
    {
      id: "configure",
      label: "Settings",
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
  if (newAnalysis)
    menu.unshift({
      id: "new-analysis",
      label: "New scan",
      icon: Plus,
      disabledReason: newAnalysis.disabledReason,
      onSelect: newAnalysis.onSelect,
    });
  const editRun =
    onEditRun && !menuOnly
      ? { onSelect: onEditRun, disabledReason: editDisabledReason }
      : null;
  return {
    editRun,
    newScan: newAnalysis,
    menu,
    display,
  };
}

export type TopicsActions = ReturnType<typeof prepareTopicsActions>;
