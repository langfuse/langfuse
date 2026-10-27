import {
  Eye,
  History,
  Play,
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
  id: "automatic" | "regenerate" | "configure" | "history";
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
  return { automatic, menu, display };
}

export type TopicsActions = ReturnType<typeof prepareTopicsActions>;
