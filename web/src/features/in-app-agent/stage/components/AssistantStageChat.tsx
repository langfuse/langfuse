import { useState } from "react";
import { ArrowLeft } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { StageChatComposer } from "@/src/features/in-app-agent/stage/components/StageChatComposer";
import { StageChatSidebar } from "@/src/features/in-app-agent/stage/components/StageChatSidebar";
import { StageChatThread } from "@/src/features/in-app-agent/stage/components/StageChatThread";
import type {
  StageChatController,
  StageContextAttachment,
} from "@/src/features/in-app-agent/stage/chat/types";

function suggestionsFor(attachment: StageContextAttachment): string[] {
  const { context } = attachment;
  if (context.kind === "trace") {
    const latency = context.facts.find(
      (item) => item.key === "latency_ms",
    )?.display;
    return [
      latency
        ? `Why did this trace take ${latency}?`
        : "Why was this trace slow?",
      "Did any step fail?",
      "Where does the cost come from?",
    ];
  }
  return [
    `What am I looking at on this ${context.label.toLowerCase()}?`,
    "What should I look into next?",
  ];
}

/**
 * The full-screen chat the page flies into: conversation rail, thread with
 * the attached page, and a composer pinned to the bottom of the visible
 * viewport.
 */
export function AssistantStageChat({
  controller,
  draft,
  onClose,
}: {
  controller: StageChatController;
  draft: StageContextAttachment;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const { context } = draft;
  const noun = context.label.toLowerCase();
  const isStageConversation = controller.messages.some(
    (message) => message.attachment?.context.capturedAt === context.capturedAt,
  );
  const title =
    controller.conversations.find(
      (conversation) => conversation.id === controller.activeConversationId,
    )?.title ?? "New conversation";

  const send = () => {
    const message = text.trim();
    if (!message) {
      return;
    }
    controller.send(message, draft);
    setText("");
  };

  return (
    <div className="bg-background flex h-full min-h-0 w-full">
      <StageChatSidebar
        conversations={controller.conversations}
        activeConversationId={controller.activeConversationId}
        backend={controller.backend}
        onNewConversation={controller.newConversation}
        onSelectConversation={controller.selectConversation}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-border flex min-h-12 shrink-0 items-center gap-2 border-b px-2 pt-[env(safe-area-inset-top)] md:px-4">
          <div className="md:hidden">
            <IconButton
              icon={ArrowLeft}
              label={`Back to the ${noun}`}
              variant="ghost"
              onClick={onClose}
            />
          </div>
          <h1
            className="min-w-0 flex-1 truncate text-sm font-bold"
            title={title}
          >
            {title}
          </h1>
          {controller.backend === "mock" ? (
            <span className="border-border text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs">
              Mocked responses
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-accent focus-visible:ring-ring hidden h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden md:inline-flex"
          >
            Back to {noun}
            <KeyboardShortcut variant="subtle" keys={["Escape"]} />
          </button>
        </header>
        <StageChatThread
          messages={controller.messages}
          isResponding={controller.isResponding}
          draft={controller.activeConversationId === null ? draft : null}
          stageCapturedAt={context.capturedAt}
          suggestions={suggestionsFor(draft)}
          onSuggestion={setText}
          onOpenPage={onClose}
        />
        <StageChatComposer
          value={text}
          onChange={setText}
          onSend={send}
          onStop={controller.stop}
          isResponding={controller.isResponding}
          blockedReason={controller.blockedReason}
          placeholder={`Ask about this ${noun}…`}
          attachedContextLabel={
            isStageConversation ? `${context.label} · ${context.title}` : null
          }
        />
      </main>
    </div>
  );
}
