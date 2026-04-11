import { type FocusEvent, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";

type SpielwieseMessageInsertRowProps = {
  nodeId: string;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
};

const insertOptions: Array<{
  kind: "user" | "system" | "assistant" | "tool";
  label: string;
}> = [
  { kind: "user", label: "User" },
  { kind: "system", label: "Instructions" },
  { kind: "assistant", label: "Assistant" },
  { kind: "tool", label: "Tool" },
];

function shouldClosePicker(event: FocusEvent<HTMLDivElement>) {
  const nextTarget = event.relatedTarget;

  return (
    !(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)
  );
}

function SpielwieseMessageInsertPicker({
  nodeId,
  onClose,
  onPointerStart,
  onPromptSectionInsert,
}: {
  nodeId: string;
  onClose: () => void;
  onPointerStart: () => void;
  onPromptSectionInsert: SpielwieseMessageInsertRowProps["onPromptSectionInsert"];
}) {
  return (
    <div
      className="border-border/50 bg-card absolute top-1/2 left-full z-20 ml-1.5 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border p-1 shadow-sm"
      data-testid="spielwiese-message-insert-picker"
      onMouseDownCapture={onPointerStart}
    >
      {insertOptions.map((option) => (
        <Button
          key={option.kind}
          className="h-7 rounded-md px-2 text-[11px] font-medium"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            onPromptSectionInsert(nodeId, option.kind);
            onClose();
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function SpielwieseMessageInsertRow({
  nodeId,
  onPromptSectionInsert,
}: SpielwieseMessageInsertRowProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const isPressingPickerRef = useRef(false);

  const closePicker = () => {
    isPressingPickerRef.current = false;
    setIsPickerOpen(false);
  };

  return (
    <div
      className="relative inline-flex w-fit justify-start pt-0.5"
      data-testid="spielwiese-message-insert-row"
      onBlur={(event) => {
        if (isPressingPickerRef.current) {
          return;
        }

        if (shouldClosePicker(event)) {
          closePicker();
        }
      }}
    >
      {isPickerOpen ? (
        <SpielwieseMessageInsertPicker
          nodeId={nodeId}
          onClose={closePicker}
          onPointerStart={() => {
            isPressingPickerRef.current = true;
          }}
          onPromptSectionInsert={onPromptSectionInsert}
        />
      ) : null}
      <Button
        aria-expanded={isPickerOpen}
        className="text-foreground/72 hover:bg-muted/35 hover:text-foreground h-7 rounded-md px-2 text-[11px] font-medium"
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setIsPickerOpen((currentValue) => !currentValue)}
      >
        <Plus className="size-3.5" />
        New message
      </Button>
    </div>
  );
}
