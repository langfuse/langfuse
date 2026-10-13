import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button as LegacyButton } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on"; sampling: number }
  | { status: "paused"; shortLabel: string };

type AutomaticProcessingMenuProps = {
  state: AutomaticProcessingState;
  canWrite: boolean;
  onEnable: () => void;
  onEditSampling: () => void;
  onTurnOff: () => void;
};

/** Topics header control showing whether new traces are processed automatically. */
export function AutomaticProcessingMenu({
  canWrite,
  onEditSampling,
  onEnable,
  onTurnOff,
  state,
}: AutomaticProcessingMenuProps) {
  const unconfigured = state.status === "unconfigured";
  return (
    <DropdownMenu
      ariaLabel="Automatic processing"
      title="Automatic processing"
      description="Summarize new traces once they are idle."
      placement="bottom-end"
      disabled={unconfigured}
      items={menuItems(state, canWrite, {
        onEditSampling,
        onEnable,
        onTurnOff,
      })}
    >
      {({ getTriggerProps }) => (
        <LegacyButton
          variant="outline"
          size="sm"
          disabled={unconfigured}
          title={
            unconfigured
              ? "Save the setup in Configure Topics first."
              : undefined
          }
          {...getTriggerProps()}
        >
          <span
            aria-hidden
            className={cn("mr-1.5 size-2 rounded-full", dotClass(state))}
          />
          {triggerLabel(state)}
          <ChevronDown className="icon-sm ml-1" />
        </LegacyButton>
      )}
    </DropdownMenu>
  );
}

function menuItems(
  state: AutomaticProcessingState,
  canWrite: boolean,
  actions: Pick<
    AutomaticProcessingMenuProps,
    "onEditSampling" | "onEnable" | "onTurnOff"
  >,
): DropdownMenuItemDefinition[] {
  const disabled = canWrite
    ? undefined
    : { reason: "You need permission to edit Topics." };
  if (state.status === "on")
    return [
      {
        id: "edit-sampling",
        type: "item",
        title: "Edit sampling…",
        disabled,
        onClick: actions.onEditSampling,
      },
      {
        id: "turn-off",
        type: "item",
        title: "Turn off",
        disabled,
        onClick: actions.onTurnOff,
      },
    ];
  if (state.status === "paused")
    return [
      {
        id: "turn-on",
        type: "item",
        title: "Turn back on…",
        disabled,
        onClick: actions.onEnable,
      },
      {
        id: "turn-off",
        type: "item",
        title: "Keep off and clear the pause",
        disabled,
        onClick: actions.onTurnOff,
      },
    ];
  return [
    {
      id: "turn-on",
      type: "item",
      title: "Turn on…",
      disabled,
      onClick: actions.onEnable,
    },
  ];
}

function triggerLabel(state: AutomaticProcessingState) {
  if (state.status === "on")
    return `Automatic: On · ${Number((state.sampling * 100).toPrecision(3))}%`;
  if (state.status === "paused") return "Automatic: Paused";
  return "Automatic: Off";
}

function dotClass(state: AutomaticProcessingState) {
  if (state.status === "on") return "bg-dark-green";
  if (state.status === "paused") return "bg-dark-yellow";
  return "bg-border";
}
