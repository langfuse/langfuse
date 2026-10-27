import type { ReactNode } from "react";
import { Eye } from "@langfuse/icons";

import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";
import { InAppAgentMessage } from "@/src/features/in-app-agent/components/InAppAgentMessage";
import { ContextAttachmentCard } from "@/src/features/in-app-agent/stage/components/ContextAttachmentCard";
import type {
  StageChatMessage,
  StageContextAttachment,
} from "@/src/features/in-app-agent/stage/chat/types";

type StageChatThreadProps = {
  messages: StageChatMessage[];
  /** The handed-over page, shown as an unsent message until the first send. */
  draft: StageContextAttachment | null;
  /** Identifies this session's attachment, the one the page flies back out of. */
  stageCapturedAt: string;
  suggestions: string[];
  onSuggestion: (text: string) => void;
  onOpenPage: () => void;
};

function UserTurn({
  children,
  label,
  isDraft = false,
}: {
  children: ReactNode;
  label?: string;
  isDraft?: boolean;
}) {
  return (
    <div className="ml-auto flex max-w-full min-w-0 flex-col items-end gap-1.5 md:max-w-[min(100%,24rem)]">
      <div
        className={
          isDraft
            ? "border-border-contrast bg-background w-full rounded-2xl border border-dashed p-2.5 shadow-xs md:w-auto"
            : "flex w-full flex-col items-end gap-1.5 md:w-auto"
        }
      >
        {children}
      </div>
      {label ? (
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Eye size="sm" color="muted" aria-hidden />
          {label} · attached as context
        </span>
      ) : null}
    </div>
  );
}

function AssistantTurn({ message }: { message: StageChatMessage }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <HaloIcon variant="notice" />
        <span>Assistant</span>
      </div>
      <InAppAgentMessage
        role="assistant"
        content={message.content}
        timestamp={message.timestamp}
        isFeedbackDisabled
      />
    </div>
  );
}

function EmptyThreadIntro({
  label,
  suggestions,
  onSuggestion,
}: {
  label: string;
  suggestions: string[];
  onSuggestion: (text: string) => void;
}) {
  const noun = label.toLowerCase();
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Ask about this {noun}</h2>
        <p className="text-muted-foreground text-sm">
          The {noun} you had open is attached below. The assistant receives its
          structured data, not just the picture.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              onSuggestion(suggestion);
            }}
            className="border-border hover:bg-accent focus-visible:ring-ring rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A reversed column keeps the thread pinned to its newest message while a
 * reply streams in, without measuring or scrolling from script.
 */
export function StageChatThread({
  messages,
  draft,
  stageCapturedAt,
  suggestions,
  onSuggestion,
  onOpenPage,
}: StageChatThreadProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-6 px-4 py-6 md:px-6 md:py-10">
        {draft && messages.length === 0 ? (
          <>
            <EmptyThreadIntro
              label={draft.context.label}
              suggestions={suggestions}
              onSuggestion={onSuggestion}
            />
            <UserTurn label="Not sent yet" isDraft>
              <ContextAttachmentCard
                attachment={draft}
                isStageSlot
                onOpenPage={onOpenPage}
              />
            </UserTurn>
          </>
        ) : null}
        {messages.map((message) =>
          message.role === "user" ? (
            <UserTurn key={message.id}>
              {message.attachment ? (
                <ContextAttachmentCard
                  attachment={message.attachment}
                  isStageSlot={
                    message.attachment.context.capturedAt === stageCapturedAt
                  }
                  onOpenPage={onOpenPage}
                />
              ) : null}
              {message.content.type === "text" ? (
                <p className="bg-muted rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap">
                  {message.content.text}
                </p>
              ) : null}
            </UserTurn>
          ) : (
            <AssistantTurn key={message.id} message={message} />
          ),
        )}
      </div>
    </div>
  );
}
