import { cva } from "class-variance-authority";
import { BotMessageSquare, ChevronDown } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { type InAppAgentQuickAction } from "@/src/features/in-app-agent/quickActions";

const splitButton = cva("", {
  variants: {
    isOpen: {
      true: "border-primary-accent bg-primary-accent/10 hover:bg-primary-accent/15",
      false: "",
    },
    side: {
      left: "rounded-r-none border-r-0",
      right: "w-6 rounded-l-none",
    },
  },
});

const shortcutLabel =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
    ? "⌘I"
    : "Ctrl+I";

type InAppAgentDetailLauncherProps = {
  isOpen: boolean;
  /** Assistant is mid-turn: quick actions must not queue a second submit. */
  isDisabled: boolean;
  quickActions: readonly InAppAgentQuickAction[];
  onToggle: () => void;
  onSelectQuickAction: (
    action: InAppAgentQuickAction,
    position: number,
  ) => void;
};

/**
 * Assistant launcher pinned in peek chrome, where the page-header launcher is
 * covered by the slide-in. Icon-only at every peek width so it stays a
 * fixed-width pinned control and the peek header's overflow planner does not
 * have to model it.
 *
 * Primary button toggles the assistant; the chevron lists focused quick actions
 * that open it and submit a framed prompt.
 */
export function InAppAgentDetailLauncher({
  isOpen,
  isDisabled,
  quickActions,
  onToggle,
  onSelectQuickAction,
}: InAppAgentDetailLauncherProps) {
  return (
    <div className="flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label={isOpen ? "Close assistant" : "Open assistant"}
            aria-pressed={isOpen}
            data-ignore-outside-interaction
            onClick={onToggle}
            className={splitButton({ isOpen, side: "left" })}
          >
            <BotMessageSquare className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isOpen ? "Close assistant" : `Assistant ${shortcutLabel}`}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label="Assistant quick actions"
            data-ignore-outside-interaction
            className={splitButton({ isOpen, side: "right" })}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* The menu portals into the `popover` layer, outside
            `[data-peek-content]` — without this the peek's outside-interaction
            check would treat a menu click as a dismiss. */}
        <DropdownMenuContent
          align="end"
          className="min-w-56"
          data-ignore-outside-interaction
        >
          <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {quickActions.map((action, position) => {
            const ActionIcon = action.icon;

            return (
              <DropdownMenuItem
                key={action.id}
                disabled={isDisabled}
                onSelect={() => {
                  onSelectQuickAction(action, position);
                }}
                className="items-start gap-2 py-2"
              >
                <ActionIcon
                  aria-hidden="true"
                  className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-snug font-bold">
                    {action.label}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs leading-snug font-normal">
                    {action.description}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
