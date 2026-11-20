"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  Bug,
  DollarSign,
  Sparkles,
  TrendingUp,
  type IconComponent,
} from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";

type HomeStarter = {
  id: string;
  label: string;
  icon: IconComponent;
  prompt: string;
};

const HOME_STARTERS: readonly HomeStarter[] = [
  {
    id: "failures",
    label: "Failure patterns",
    icon: Bug,
    prompt:
      "Run a structured error analysis on failed traces. Group failures by cause, show counts, and link an example trace for each group.",
  },
  {
    id: "activity",
    label: "Recent activity",
    icon: Activity,
    prompt:
      "Summarize what changed in this project recently: new trace names, shifts in volume, and new models or prompts in use.",
  },
  {
    id: "unusual",
    label: "Unusual patterns",
    icon: TrendingUp,
    prompt:
      "Find unusual patterns in traces, such as spikes in latency, error rate or token use, and show when each one started.",
  },
  {
    id: "cost",
    label: "Cost changes",
    icon: DollarSign,
    prompt:
      "Explain how model costs changed. Break the change down by model and trace name, and flag the biggest drivers.",
  },
];

const DEFAULT_PLACEHOLDER = "Ask about your traces, costs or scores…";

/** Project home entry point: asking here turns Home into the conversation. */
export function InAppAgentHomeComposer({
  projectName,
}: {
  projectName: string;
}) {
  const { openAssistant, setLayoutMode, submit } = useInAppAiAgent();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [request, setRequest] = useState("");
  // The starter whose prompt currently fills the composer, until it is edited.
  const [pickedStarterId, setPickedStarterId] = useState<string | null>(null);
  // The starter under the pointer or keyboard focus. Its prompt shows as the
  // placeholder, so it only previews while the field is empty.
  const [previewedStarterId, setPreviewedStarterId] = useState<string | null>(
    null,
  );
  const previewedPrompt = HOME_STARTERS.find(
    (starter) => starter.id === previewedStarterId,
  )?.prompt;
  const trimmedRequest = request.trim();

  const startConversation = () => {
    if (!trimmedRequest || !openAssistant("home_composer")) {
      return;
    }

    setLayoutMode("full");
    setRequest("");
    setPickedStarterId(null);
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
          <span className="text-primary-accent flex">
            <Sparkles size="lg" color="inherit" aria-hidden />
          </span>
          <span>Ask about {projectName}</span>
        </h2>
        <p className="text-muted-foreground text-base text-pretty">
          Get answers from your traces, costs and scores. Write your own
          question or start from a common one.
        </p>
      </div>
      <div className="bg-card border-border-contrast focus-within:border-primary-accent/55 focus-within:ring-primary-accent/12 flex flex-col rounded-xl border shadow-md focus-within:ring-3">
        <label htmlFor="home-ask-input" className="sr-only">
          Question for Langfuse
        </label>
        <textarea
          id="home-ask-input"
          ref={textareaRef}
          autoComplete="off"
          maxLength={4000}
          rows={3}
          placeholder={previewedPrompt ?? DEFAULT_PLACEHOLDER}
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
            setPickedStarterId(null);
          }}
          onKeyDown={handleKeyDown}
          // The card draws the focus state, so the field's own border and ring
          // are off.
          className="placeholder:text-foreground-tertiary min-h-24 w-full resize-none border-0 bg-transparent px-4 pt-4 pb-1 text-base leading-relaxed outline-none focus:ring-0"
        />
        <div className="flex flex-wrap items-center justify-end gap-2 py-2 pr-2 pl-3">
          <KeyboardShortcut
            keys={["Mod", "Enter"]}
            variant="subtle"
            size="xs"
          />
          <Button
            text="Ask"
            variant="primary"
            size="sm"
            icon={ArrowUp}
            disabled={!trimmedRequest}
            onClick={startConversation}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Start from</span>
        {HOME_STARTERS.map((starter) => (
          <span
            key={starter.id}
            className="inline-flex"
            onMouseEnter={() => {
              setPreviewedStarterId(starter.id);
            }}
            onMouseLeave={() => {
              setPreviewedStarterId(null);
            }}
            onFocus={() => {
              setPreviewedStarterId(starter.id);
            }}
            onBlur={() => {
              setPreviewedStarterId(null);
            }}
          >
            <Button
              text={starter.label}
              variant={starter.id === pickedStarterId ? "secondary" : "outline"}
              size="sm"
              icon={starter.icon}
              onClick={() => {
                setRequest(starter.prompt);
                setPickedStarterId(starter.id);
                setPreviewedStarterId(null);
                textareaRef.current?.focus();
              }}
            />
          </span>
        ))}
      </div>
    </section>
  );
}
