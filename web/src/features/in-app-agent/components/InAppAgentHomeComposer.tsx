"use client";

import { type KeyboardEvent, type ReactNode, useState } from "react";
import { ArrowUp } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Textarea } from "@/src/components/ui/textarea";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { getInAppAgentQuickActions } from "@/src/features/in-app-agent/quickActions";

const HOME_SUGGESTED_PROMPTS = [
  ...getInAppAgentQuickActions("observability"),
  ...getInAppAgentQuickActions("dashboards").filter(
    (action) => action.id === "track-cost-and-usage",
  ),
];

/**
 * Project home entry point: asking here turns Home into the conversation.
 * `scopeControls` are the page's own filters, shown in the composer because
 * they scope the question as well as the widgets below.
 */
export function InAppAgentHomeComposer({
  scopeControls,
}: {
  scopeControls: ReactNode;
}) {
  const { openAssistant, setLayoutMode, submit } = useInAppAiAgent();
  const [request, setRequest] = useState("");

  const startConversation = (content: string) => {
    if (!content || !openAssistant("home_composer")) {
      return;
    }

    setLayoutMode("full");
    setRequest("");
    // `submit` reports its own failures in the conversation.
    submit(content, {
      newConversation: true,
      entryPoint: "home_composer",
    }).catch(() => undefined);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      startConversation(request.trim());
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Not a <form>: the scope controls hold their own buttons and popovers,
          whose clicks would otherwise submit it. */}
      <div className="bg-card focus-within:border-ring flex flex-col gap-2 rounded-xl border p-3 shadow-xs">
        <Textarea
          aria-label="Ask Halo"
          autoComplete="off"
          maxLength={4000}
          rows={2}
          placeholder="Ask about your traces, costs, or evals"
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          className="max-h-40 min-h-14 resize-none border-0 bg-transparent p-1 text-base shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          {scopeControls}
          <div className="ml-auto">
            <IconButton
              icon={ArrowUp}
              label="Send"
              variant="outline"
              disabled={!request.trim()}
              onClick={() => {
                startConversation(request.trim());
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {HOME_SUGGESTED_PROMPTS.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            icon={action.icon}
            text={action.label}
            onClick={() => {
              startConversation(action.prompt);
            }}
          />
        ))}
      </div>
    </div>
  );
}
