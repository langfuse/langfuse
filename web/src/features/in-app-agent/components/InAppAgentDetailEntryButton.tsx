import { useCallback } from "react";
import { useRouter } from "next/router";
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
import {
  useCanUseInAppAgent,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import {
  getInAppAgentFocusedQuickActions,
  getInAppAgentQuickActionContext,
} from "@/src/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";

/** Compact Assistant launcher for peek chrome / detail headers. Primary click
 * opens the assistant; the chevron lists focused quick actions that open the
 * assistant and submit the framed prompt.
 *
 * Always offers the trace-focused set — same chips whether the peek shows the
 * root trace or a selected observation inside it.
 *
 * Labeled mode matches peek prev/next (`Button` default `h-8`). Icon-only mode
 * matches compact peek controls (`icon-xs` / `h-6`). */
export function InAppAgentDetailEntryButton({
  showLabel = true,
  className,
}: {
  showLabel?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { open, setOpen, openAssistant, submit, isRunning, isSubmitting } =
    useInAppAiAgent();
  const canUseAssistant = useCanUseInAppAgent();
  const capture = usePostHogClientCapture();
  const focusedQuickActions = getInAppAgentFocusedQuickActions("trace") ?? [];
  const quickActionCategory = getInAppAgentQuickActionContext(router.asPath);

  const toggleAssistant = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    openAssistant("detail_header");
  }, [open, openAssistant, setOpen]);

  const runQuickAction = useCallback(
    async (
      action: {
        id: string;
        prompt: string;
      },
      position: number,
    ) => {
      if (isRunning || isSubmitting) {
        return;
      }

      if (!openAssistant("detail_header")) {
        return;
      }

      capture("in_app_agent:quick_action_started", {
        quickActionKey: action.id,
        quickActionCategory,
        position,
      });

      await submit(action.prompt, {
        quickAction: {
          key: action.id,
          category: quickActionCategory,
        },
      });
    },
    [
      capture,
      isRunning,
      isSubmitting,
      openAssistant,
      quickActionCategory,
      submit,
    ],
  );

  if (!canUseAssistant) {
    return null;
  }

  const shortcutLabel =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
      ? "⌘I"
      : "Ctrl+I";

  const openAccentClass =
    open &&
    "border-primary-accent bg-primary-accent/10 hover:bg-primary-accent/15";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        showLabel ? "h-8" : "h-6",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={showLabel ? "default" : "icon-xs"}
            aria-label={open ? "Close assistant" : "Open assistant"}
            aria-pressed={open}
            data-ignore-outside-interaction
            onClick={toggleAssistant}
            className={cn(
              "rounded-r-none border-r-0",
              showLabel && "gap-1.5 px-2",
              openAccentClass,
            )}
          >
            <BotMessageSquare className="size-4" />
            {showLabel ? <span>Assistant</span> : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`Assistant ${shortcutLabel}`}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={showLabel ? "default" : "icon-xs"}
            aria-label="Assistant quick actions"
            data-ignore-outside-interaction
            className={cn(
              "rounded-l-none",
              showLabel ? "px-2" : "w-6",
              openAccentClass,
            )}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {focusedQuickActions.map((action, position) => {
            const ActionIcon = action.icon;

            return (
              <DropdownMenuItem
                key={action.id}
                disabled={isRunning || isSubmitting}
                onSelect={() => {
                  runQuickAction(action, position).catch(() => undefined);
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
