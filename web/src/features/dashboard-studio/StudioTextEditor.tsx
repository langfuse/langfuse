import { useState } from "react";
import { ArrowLeftIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { StudioTextWidget } from "./StudioTextWidget";

export function StudioTextEditor({
  initialValue,
  isNew,
  onApply,
  onCancel,
}: {
  initialValue: { title: string; content: string };
  isNew: boolean;
  onApply: (value: { title: string; content: string }) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  return (
    <section
      aria-label="Text editor"
      className="ph-no-capture bg-background flex h-full min-h-0 min-w-0 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Button
            text="Back"
            icon={ArrowLeftIcon}
            variant="ghost"
            onClick={onCancel}
          />
          <h1 className="text-base font-bold">
            {isNew ? "New text" : "Edit text"}
          </h1>
        </div>
        <Button text="Apply text" onClick={() => onApply(draft)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-4 lg:grid-cols-2 lg:p-6">
          <div className="flex min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-2 text-xs font-bold">
              Title
              <Input
                aria-label="Text title"
                maxLength={200}
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-xs font-bold">
              Markdown
              <textarea
                aria-label="Markdown content"
                className="bg-background min-h-96 resize-y rounded-md border p-3 font-mono text-sm font-normal"
                value={draft.content}
                onChange={(event) =>
                  setDraft({ ...draft, content: event.target.value })
                }
                placeholder="Write Markdown…"
                maxLength={10000}
              />
            </label>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-bold">Preview</h2>
            <div className="bg-background rounded-lg border">
              <StudioTextWidget title={draft.title} content={draft.content} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
