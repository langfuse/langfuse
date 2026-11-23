import { useState } from "react";
import { ChevronRightIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { StudioTextWidget } from "./StudioTextWidget";

export function StudioTextEditor({
  initialValue,
  dashboardName,
  isNew,
  onApply,
  onCancel,
}: {
  initialValue: { title: string; content: string };
  dashboardName: string;
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
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span
            className="text-muted-foreground max-w-52 truncate"
            title={dashboardName}
          >
            {dashboardName}
          </span>
          <ChevronRightIcon size="base" color="muted" />
          <h1 className="font-medium">{isNew ? "New text" : "Edit text"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button text="Cancel" variant="ghost" onClick={onCancel} />
          <Button
            text={isNew ? "Add to dashboard" : "Apply changes"}
            disabled={!draft.content.trim() && !draft.title.trim()}
            onClick={() => onApply(draft)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid min-h-full lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4 border-b p-5 lg:border-r lg:border-b-0">
            <label className="flex flex-col gap-2 text-xs font-bold">
              Title (optional)
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
              Content
              <textarea
                aria-label="Markdown content"
                className="bg-background min-h-96 resize-y rounded-md border p-3 font-mono text-sm font-normal"
                value={draft.content}
                onChange={(event) =>
                  setDraft({ ...draft, content: event.target.value })
                }
                placeholder="Use Markdown for headings, lists, emphasis and links…"
                maxLength={10000}
              />
            </label>
            <p className="text-muted-foreground text-xs">
              Supports Markdown. Text grows to fit its content on the dashboard.
            </p>
          </div>
          <div className="bg-muted/20 flex min-w-0 flex-col gap-3 p-5">
            <h2 className="text-muted-foreground text-xs font-bold">Preview</h2>
            <div className="bg-background rounded-lg border">
              {draft.title || draft.content ? (
                <StudioTextWidget title={draft.title} content={draft.content} />
              ) : (
                <p className="text-muted-foreground px-5 py-12 text-center text-sm">
                  Your text will appear here.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
