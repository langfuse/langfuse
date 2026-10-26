import {
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
}) {
  const { state, saving } = automaticProcessing;
  const automatic = menuOnly
    ? null
    : {
        state,
        canWrite: canWrite && !saving,
        onSelect: onAutomaticProcessing,
      };
  const menu: TopicAction[] = [];
  // Narrow headers hide the inline control, so the menu keeps it reachable.
  if (automatic) {
    const disabledReason = processingDisabledReason(state, canWrite, saving);
    menu.push({
      id: "automatic",
      label:
        state.status === "off" || state.status === "unconfigured"
          ? "Analyze"
          : "Auto-analyze",
      icon: Play,
      badge: automaticBadge[state.status],
      disabledReason:
        disabledReason && state.status === "paused"
          ? `${state.shortLabel}. ${disabledReason}`
          : disabledReason,
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
  return { automatic, menu };
}

export type TopicsActions = ReturnType<typeof prepareTopicsActions>;
