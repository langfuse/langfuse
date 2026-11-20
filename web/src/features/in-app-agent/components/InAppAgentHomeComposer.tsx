"use client";

import { type KeyboardEvent, useState } from "react";
import { History } from "@langfuse/icons";
import { formatDistanceToNow, subDays } from "date-fns";

import { ControlledDropdownMenu } from "@/src/components/design-system/ControlledDropdownMenu/ControlledDropdownMenu";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Button } from "@/src/components/ui/button";
import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";
import { InAppAgentAskButton } from "@/src/features/in-app-agent/components/InAppAgentAskButton";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import {
  IN_APP_AGENT_QUICK_ACTION_CONTEXTS,
  IN_APP_AGENT_QUICK_ACTION_CONTEXT_ICONS,
  IN_APP_AGENT_QUICK_ACTION_CONTEXT_LABELS,
  getInAppAgentQuickActions,
  type InAppAgentQuickActionContext,
} from "@/src/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type HomeStartOption = { id: string; label: string; prompt: string };

// Home's own wording for the Observe group; the other groups use the
// assistant's quick actions as they are.
const HOME_OBSERVE_OPTIONS: readonly HomeStartOption[] = [
  {
    id: "home-failure-patterns",
    label: "Failure patterns",
    prompt:
      "Run a structured error analysis on failed traces. Group failures by cause, show counts, and link an example trace for each group.",
  },
  {
    id: "home-recent-activity",
    label: "Recent activity",
    prompt:
      "Summarize what changed in this project recently: new trace names, shifts in volume, and new models or prompts in use.",
  },
  {
    id: "home-unusual-patterns",
    label: "Unusual patterns",
    prompt:
      "Find unusual patterns in traces, such as spikes in latency, error rate or token use, and show when each one started.",
  },
  {
    id: "home-cost-changes",
    label: "Cost changes",
    prompt:
      "Explain how model costs changed. Break the change down by model and trace name, and flag the biggest drivers.",
  },
];

const HOME_START_GROUPS: ReadonlyArray<{
  context: InAppAgentQuickActionContext;
  options: readonly HomeStartOption[];
}> = IN_APP_AGENT_QUICK_ACTION_CONTEXTS.map((context) => ({
  context,
  options:
    context === "observability"
      ? HOME_OBSERVE_OPTIONS
      : getInAppAgentQuickActions(context),
}));

const DEFAULT_PLACEHOLDER = "Ask about your traces, costs or scores…";
// How far back the latest conversation still counts as one to continue.
const CONTINUE_WINDOW_DAYS = 7;

/** Project home entry point: asking here turns Home into the conversation. */
export function InAppAgentHomeComposer() {
  const {
    conversations,
    homeAskInputRef,
    openAssistant,
    selectConversation,
    setLayoutMode,
    submit,
  } = useInAppAiAgent();
  // The list is ordered by last activity, so the first entry is the latest.
  const latestConversation = conversations[0];
  const conversationToContinue =
    latestConversation &&
    latestConversation.updatedAt > subDays(new Date(), CONTINUE_WINDOW_DAYS)
      ? latestConversation
      : null;
  const capture = usePostHogClientCapture();
  const [request, setRequest] = useState("");
  // The group whose option currently fills the composer, until it is edited.
  const [pickedGroup, setPickedGroup] =
    useState<InAppAgentQuickActionContext | null>(null);
  const [openGroup, setOpenGroup] =
    useState<InAppAgentQuickActionContext | null>(null);
  // Prompt of the menu option under the pointer or keyboard focus. It shows as
  // the placeholder, so it only previews while the field is empty.
  const [previewedPrompt, setPreviewedPrompt] = useState<string | null>(null);
  const trimmedRequest = request.trim();

  const startConversation = () => {
    if (!trimmedRequest || !openAssistant("home_composer")) {
      return;
    }

    setLayoutMode("full");
    setRequest("");
    setPickedGroup(null);
    // `submit` reports its own failures in the conversation.
    submit(trimmedRequest, {
      newConversation: true,
      entryPoint: "home_composer",
    }).catch(() => undefined);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      startConversation();
    }
  };

  return (
    <section
      aria-labelledby="home-ask-title"
      className="mx-auto flex w-full max-w-3xl flex-col gap-3.5"
    >
      <div className="flex flex-col items-center gap-1.5 pb-2.5 text-center">
        <h2
          id="home-ask-title"
          className="flex items-center gap-2 text-xl font-bold"
        >
          <HaloIcon variant="heading" />
          <span>Ask Halo</span>
        </h2>
        <p className="text-muted-foreground text-base">
          Get answers from your traces, costs and scores.
        </p>
      </div>
      <div className="bg-card border-border-contrast focus-within:border-primary-accent/55 focus-within:ring-primary-accent/12 flex flex-col rounded-xl border shadow-md focus-within:ring-3">
        <label htmlFor="home-ask-input" className="sr-only">
          Question for Langfuse
        </label>
        <textarea
          id="home-ask-input"
          ref={homeAskInputRef}
          autoComplete="off"
          maxLength={4000}
          rows={3}
          placeholder={previewedPrompt ?? DEFAULT_PLACEHOLDER}
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
            setPickedGroup(null);
          }}
          onKeyDown={handleKeyDown}
          // The card draws the focus state, so the field's own border and ring
          // are off.
          className="placeholder:text-foreground-tertiary min-h-24 w-full resize-none border-0 bg-transparent px-4 pt-4 pb-1 text-base leading-relaxed outline-none focus:ring-0"
        />
        <div className="flex flex-wrap items-center justify-end gap-2 py-2 pr-2 pl-3">
          <InAppAgentAskButton
            disabled={!trimmedRequest}
            onClick={startConversation}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Start from</span>
        {HOME_START_GROUPS.map(({ context, options }) => {
          const GroupIcon = IN_APP_AGENT_QUICK_ACTION_CONTEXT_ICONS[context];
          const label = IN_APP_AGENT_QUICK_ACTION_CONTEXT_LABELS[context];

          return (
            <ControlledDropdownMenu
              key={context}
              ariaLabel={`${label} starters`}
              open={openGroup === context}
              onOpenChange={(isOpen) => {
                setOpenGroup(isOpen ? context : null);
                setPreviewedPrompt(null);
              }}
              onActiveItemChange={(optionId) => {
                setPreviewedPrompt(
                  options.find((option) => option.id === optionId)?.prompt ??
                    null,
                );
              }}
              items={options.map((option, position) => ({
                type: "item" as const,
                id: option.id,
                title: option.label,
                onClick: () => {
                  capture("in_app_agent:quick_action_started", {
                    quickActionKey: option.id,
                    quickActionCategory: context,
                    position,
                    entryPoint: "home_composer",
                  });
                  setRequest(option.prompt);
                  setPickedGroup(context);
                  setPreviewedPrompt(null);
                  // After the closing menu has handed focus back to its
                  // trigger, so the box keeps it.
                  window.requestAnimationFrame(() => {
                    homeAskInputRef.current?.focus();
                  });
                },
              }))}
            >
              {({ getTriggerProps }) => (
                <Button
                  {...getTriggerProps()}
                  type="button"
                  variant={pickedGroup === context ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                >
                  <GroupIcon size="base" color="inherit" aria-hidden />
                  <span>{label}</span>
                  <DropdownIndicator size="sm" />
                </Button>
              )}
            </ControlledDropdownMenu>
          );
        })}
      </div>
      {conversationToContinue ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Continue</span>
          <TextLink
            path=""
            value={
              conversationToContinue.title?.trim() || "Untitled conversation"
            }
            icon={History}
            onClick={() => {
              if (!openAssistant("home_continue")) {
                return;
              }

              selectConversation(conversationToContinue.id);
              setLayoutMode("full");
            }}
          />
          <span className="text-muted-foreground text-xs">
            {formatDistanceToNow(conversationToContinue.updatedAt, {
              addSuffix: true,
            })}
          </span>
        </div>
      ) : null}
    </section>
  );
}
