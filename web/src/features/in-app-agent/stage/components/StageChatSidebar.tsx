import { SquarePen } from "@langfuse/icons";

import { HaloIcon } from "@/src/features/in-app-agent/components/HaloIcon";
import type {
  StageChatBackend,
  StageChatConversation,
} from "@/src/features/in-app-agent/stage/chat/types";
import { cn } from "@/src/utils/tailwind";

/** Conversation history in the chat's own left rail (desktop only). */
export function StageChatSidebar({
  conversations,
  activeConversationId,
  backend,
  onNewConversation,
  onSelectConversation,
}: {
  conversations: StageChatConversation[];
  activeConversationId: string | null;
  backend: StageChatBackend;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <aside className="border-border bg-muted/40 hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex h-12 items-center gap-2 px-4">
        <HaloIcon variant="launcher" />
        <span className="text-sm font-bold">Assistant</span>
      </div>
      <div className="px-2">
        <button
          type="button"
          onClick={onNewConversation}
          className={cn(
            "hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden",
            activeConversationId === null && "bg-accent",
          )}
        >
          <SquarePen size="base" color="default" aria-hidden />
          New conversation
        </button>
      </div>
      <nav
        aria-label="Recent conversations"
        className="mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2"
      >
        <span className="text-muted-foreground px-2 pb-1 text-xs">Recent</span>
        {conversations.length === 0 ? (
          <span className="text-muted-foreground px-2 text-xs">
            Nothing yet. Your conversations show up here.
          </span>
        ) : null}
        {conversations.map((conversation) => {
          const title = conversation.title ?? "Untitled conversation";
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                onSelectConversation(conversation.id);
              }}
              aria-current={
                conversation.id === activeConversationId ? "page" : undefined
              }
              title={title}
              className="hover:bg-accent focus-visible:ring-ring aria-[current=page]:bg-accent truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
            >
              {title}
            </button>
          );
        })}
      </nav>
      <div className="border-border text-muted-foreground border-t px-4 py-3 text-xs">
        {backend === "mock"
          ? "Preview: responses are mocked because no assistant backend is configured."
          : "Preview of the context-zoom assistant."}
      </div>
    </aside>
  );
}
