import {
  History,
  Play,
  RefreshCw,
  Settings,
  type IconComponent,
} from "@langfuse/icons";
import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type TopicAction = {
  id: "automatic" | "manual" | "configure" | "history" | "refresh";
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  disabledReason?: string;
  badge?: string;
  variant: "primary" | "secondary";
};

export type AutomaticProcessingAction = TopicAction & {
  badge: string;
  badgeStatus: Status;
};

const processingPresentation = {
  unconfigured: { badge: "Off", badgeStatus: "inactive", variant: "secondary" },
  off: { badge: "Off", badgeStatus: "inactive", variant: "primary" },
  on: { badge: "On", badgeStatus: "active", variant: "secondary" },
  paused: { badge: "Paused", badgeStatus: "paused", variant: "primary" },
} satisfies Record<
  AutomaticProcessingState["status"],
  Pick<AutomaticProcessingAction, "badge" | "badgeStatus" | "variant">
>;

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

export function prepareAutomaticProcessingAction({
  state,
  canWrite,
  saving,
  onSelect,
}: {
  state: AutomaticProcessingState;
  canWrite: boolean;
  saving: boolean;
  onSelect: () => void;
}): AutomaticProcessingAction {
  return {
    id: "automatic",
    label: "Automatic processing",
    icon: RefreshCw,
    ...processingPresentation[state.status],
    disabledReason: processingDisabledReason(state, canWrite, saving),
    onSelect,
  };
}

/** One action policy for inline controls and both overflow-menu presentations. */
export function prepareTopicsActions({
  automaticProcessing,
  canWrite,
  configured,
  configureAvailable,
  configureVariant,
  manualAvailable,
  menuOnly,
  onAutomaticProcessing,
  onConfigure,
  onManualProcessing,
  onHistory,
  onRefresh,
}: {
  automaticProcessing: { state: AutomaticProcessingState; saving: boolean };
  canWrite: boolean;
  configured: boolean;
  configureAvailable: boolean;
  configureVariant: "primary" | "secondary";
  manualAvailable: boolean;
  menuOnly: boolean;
  onAutomaticProcessing: () => void;
  onConfigure: () => void;
  onManualProcessing: () => void;
  onHistory: () => void;
  onRefresh: () => void;
}) {
  const automatic = menuOnly
    ? null
    : prepareAutomaticProcessingAction({
        ...automaticProcessing,
        canWrite,
        onSelect: onAutomaticProcessing,
      });
  const configure: TopicAction = {
    id: "configure",
    label: "Configure Topics",
    icon: Settings,
    variant: configureVariant,
    onSelect: onConfigure,
    disabledReason:
      !configured && !configureAvailable ? "Loading configuration…" : undefined,
  };
  const manual: TopicAction = {
    id: "manual",
    label: "Manual processing",
    icon: Play,
    variant: "secondary",
    onSelect: onManualProcessing,
  };
  const inline: TopicAction[] = [];
  const menu: TopicAction[] = [];
  if (automatic) menu.push(automatic);
  if (!menuOnly && !configured) inline.push(configure);
  if (!menuOnly && manualAvailable) {
    inline.push(manual);
    menu.push(manual);
  }
  if (configured || !menuOnly) menu.push(configure);
  menu.push(
    {
      id: "history",
      label: "History",
      icon: History,
      variant: "secondary",
      onSelect: onHistory,
    },
    {
      id: "refresh",
      label: "Refresh results",
      icon: RefreshCw,
      variant: "secondary",
      onSelect: onRefresh,
    },
  );
  return { automatic, inline, menu };
}

export type TopicsActions = ReturnType<typeof prepareTopicsActions>;
