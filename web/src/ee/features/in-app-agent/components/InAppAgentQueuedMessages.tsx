import { useState } from "react";
import { ChevronDown, CornerDownRight, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

export type InAppAgentQueuedMessageItem = {
  id: string;
  content: string;
};

export function InAppAgentQueuedMessages({
  messages,
  defaultExpanded = true,
  onEdit,
  onDelete,
}: {
  messages: readonly InAppAgentQueuedMessageItem[];
  defaultExpanded?: boolean;
  onEdit: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-border bg-card overflow-hidden rounded-md border">
      <button
        type="button"
        aria-expanded={isExpanded}
        className="hover:bg-muted/60 flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-bold"
        onClick={() => {
          setIsExpanded((current) => !current);
        }}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 transition-transform",
            !isExpanded && "-rotate-90",
          )}
        />
        {messages.length} queued
      </button>
      {isExpanded ? (
        <ol className="border-border divide-y border-t">
          {messages.map((message, index) => (
            <li key={message.id} className="bg-card flex gap-2 px-2 py-2">
              <CornerDownRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <p className="min-w-0 flex-1 text-xs leading-5 wrap-break-word whitespace-pre-wrap">
                {message.content}
              </p>
              <div className="flex shrink-0 items-start gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Edit queued message ${index + 1}`}
                  onClick={() => {
                    onEdit(message.id);
                  }}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="hover:text-destructive"
                  aria-label={`Delete queued message ${index + 1}`}
                  onClick={() => {
                    onDelete(message.id);
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
