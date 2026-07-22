import { useState, type KeyboardEvent } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
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
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState<{
    messageId: string;
    content: string;
  } | null>(null);

  const saveEdit = () => {
    const content = editing?.content.trim();
    if (!editing || !content) {
      return;
    }
    onEdit(editing.messageId, content);
    setEditing(null);
  };
  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveEdit();
    }
  };

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
          {messages.map((message, index) => {
            const isEditing = editing?.messageId === message.id;
            return (
              <li key={message.id} className="flex gap-2 px-2 py-2">
                <span className="bg-muted text-muted-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold">
                  {index + 1}
                </span>
                {isEditing ? (
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Textarea
                      autoFocus
                      aria-label={`Edit queued message ${index + 1}`}
                      rows={2}
                      value={editing.content}
                      onChange={(event) => {
                        setEditing({
                          messageId: message.id,
                          content: event.target.value,
                        });
                      }}
                      onKeyDown={handleEditKeyDown}
                      className="max-h-32 min-h-14 resize-y text-xs"
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditing(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={!editing.content.trim()}
                        onClick={saveEdit}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
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
                          setEditing({
                            messageId: message.id,
                            content: message.content,
                          });
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
                          if (editing?.messageId === message.id) {
                            setEditing(null);
                          }
                          onDelete(message.id);
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
