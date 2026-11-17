import { useState } from "react";
import { XIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { StudioTextWidget } from "./StudioTextWidget";

export function StudioTextEditor({
  initialValue,
  onApply,
  onCancel,
}: {
  initialValue: { title: string; content: string };
  onApply: (value: { title: string; content: string }) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  return (
    <aside className="ph-no-capture bg-muted/20 order-first flex flex-col gap-4 border-l p-4 xl:order-last">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Give your dashboard context</h2>
        <IconButton label="Close editor" icon={XIcon} onClick={onCancel} />
      </div>
      <p className="text-muted-foreground text-sm">
        Introduce a section, explain a trend, or link to the next question.
      </p>
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
          className="bg-background min-h-60 resize-y rounded-md border p-3 font-mono text-sm font-normal"
          value={draft.content}
          onChange={(event) =>
            setDraft({ ...draft, content: event.target.value })
          }
          placeholder="## What is happening?"
          maxLength={10000}
        />
      </label>
      <div className="bg-background rounded-lg border">
        <StudioTextWidget title={draft.title} content={draft.content} />
      </div>
      <div className="flex justify-between gap-2">
        <Button text="Cancel" variant="ghost" onClick={onCancel} />
        <Button text="Apply text" onClick={() => onApply(draft)} />
      </div>
    </aside>
  );
}
