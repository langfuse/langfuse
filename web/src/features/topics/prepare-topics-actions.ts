import {
  Eye,
  History,
  ListChecks,
  Play,
  RefreshCw,
  ScanSearch,
  Settings,
  type IconComponent,
} from "@langfuse/icons";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type TopicAction = {
  id:
    | "automatic"
    | "regenerate"
    | "process"
    | "rules"
    | "configure"
    | "history";
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  disabledReason?: string;
  badge?: string;
};

const automaticBadge: Record<AutomaticProcessingState["status"], string> = {
  unconfigured: "Off",
  off: "Off",
  on: "On",
  paused: "Paused",
};

function processingDisabledReason(
  state: AutomaticProcessingState,
  canWrite: boolean,
  saving: boolean,
) {
  if (state.status === "unconfigured") return "Configure Topics first.";
  if (!canWrite) return "You need permission to edit Topics.";
  if (saving) return "Saving settings…";
  return undefined;
}

/** One action policy for the inline Analyze control and both overflow-menu presentations. */
export function prepareTopicsActions({
  automaticProcessing,
  canWrite,
  configureAvailable,
  regenerateAvailable,
  menuOnly,
  onAutomaticProcessing,
  onConfigure,
  onRegenerate,
  onHistory,
  onProcessPastTraces,
  onManageRules,
  showUnassigned,
  onShowUnassignedChange,
}: {
  automaticProcessing: { state: AutomaticProcessingState; saving: boolean };
  canWrite: boolean;
  configureAvailable: boolean;
  regenerateAvailable: boolean;
  menuOnly: boolean;
  onAutomaticProcessing: () => void;
  onConfigure: () => void;
  onRegenerate: () => void;
  onHistory: () => void;
  onProcessPastTraces?: () => void;
  onManageRules?: () => void;
  showUnassigned: boolean;
  onShowUnassignedChange: (show: boolean) => void;
}) {
  const { state, saving } = automaticProcessing;
  const reason = processingDisabledReason(state, canWrite, saving);
  const disabledReason =
    reason && state.status === "paused"
      ? `${state.shortLabel}. ${reason}`
      : reason;
  const automatic = menuOnly
    ? null
    : { state, disabledReason, onSelect: onAutomaticProcessing };
  const menu: TopicAction[] = [];
  // Narrow headers hide the inline control, so the menu keeps it reachable.
  if (automatic) {
    menu.push({
      id: "automatic",
      label:
        state.status === "off" || state.status === "unconfigured"
          ? "Analyze"
          : "Auto-analyze",
      icon: Play,
      badge: automaticBadge[state.status],
      disabledReason,
      onSelect: onAutomaticProcessing,
    });
  }
  if (onProcessPastTraces)
    menu.push({
      id: "process",
      label: "Process past traces",
      icon: ScanSearch,
      disabledReason:
        (canWrite ? undefined : "You need permission to edit Topics.") ??
        (regenerateAvailable ? undefined : "Configure Topics first."),
      onSelect: onProcessPastTraces,
    });
  if (onManageRules)
    menu.push({
      id: "rules",
      label: "Manage rules",
      icon: ListChecks,
      onSelect: onManageRules,
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
  return { automatic, menu, display };
}

export type TopicsActions = ReturnType<typeof prepareTopicsActions>;
