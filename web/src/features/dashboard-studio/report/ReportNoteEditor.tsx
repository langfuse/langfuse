import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { MarkdownView } from "@/src/components/ui/MarkdownView";
import type { ReportNote } from "./reportSections";

export function ReportNoteEditor({
  note,
  onSave,
  onCancel,
  saving,
}: {
  note: ReportNote;
  onSave: (note: ReportNote) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [preview, setPreview] = useState(false);
  return (
    <form
      aria-label="Markdown cell"
      className="ph-no-capture bg-background space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...note, title, content });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold">Markdown cell</span>
        <Button
          size="sm"
          variant="ghost"
          text={preview ? "Write" : "Preview"}
          onClick={() => setPreview(!preview)}
        />
      </div>
      {preview ? (
        <>
          <h3 className="font-bold">{title}</h3>
          <MarkdownView markdown={content} />
        </>
      ) : (
        <>
          <Input
            aria-label="Note title"
            placeholder="Title (optional)"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            autoFocus
            aria-label="Markdown content"
            className="border-input bg-background min-h-36 w-full rounded-md border p-3 font-mono text-sm"
            rows={5}
            placeholder="Write a note, or start a section with # Heading"
            value={content}
            maxLength={10000}
            onChange={(event) => setContent(event.target.value)}
          />
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          text="Cancel"
          disabled={saving}
          onClick={onCancel}
        />
        <Button
          size="sm"
          text="Save cell"
          type="submit"
          loading={saving}
          disabled={!content.trim() && !title.trim()}
        />
      </div>
    </form>
  );
}
