import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
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

function SpielwieseMessageInsertPicker({
  isOpen,
  nodeId,
  onClose,
  onPromptSectionInsert,
}: {
  isOpen: boolean;
  nodeId: string;
  onClose: () => void;
  onPromptSectionInsert: SpielwieseMessageInsertRowProps["onPromptSectionInsert"];
}) {
  const pickerId = `${nodeId}-message-insert-picker`;

  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        "flex h-full shrink-0 items-stretch overflow-hidden border-l transition-[max-width,border-color,background-color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        isOpen
          ? "max-w-[14.5rem] border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.035)]"
          : "pointer-events-none max-w-0 border-transparent bg-transparent",
      )}
      data-state={isOpen ? "open" : "closed"}
      data-testid="spielwiese-message-insert-picker"
      id={pickerId}
    >
      <div
        className={cn(
          "flex w-max items-center gap-0.5 px-1 transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
          isOpen
            ? "translate-x-0 opacity-100 delay-75"
            : "translate-x-1 opacity-0 delay-0",
        )}
      >
        {insertOptions.map((option) => (
          <Button
            key={option.kind}
            className="text-foreground/72 hover:bg-background/80 hover:text-foreground h-5 rounded-md px-2 text-[11px] font-medium"
            disabled={!isOpen}
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
    </div>
  );
}

export function SpielwieseMessageInsertRow({
  nodeId,
  onPromptSectionInsert,
}: SpielwieseMessageInsertRowProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const closePicker = () => {
    setIsPickerOpen(false);
  };

  return (
    <div
      className="relative inline-flex w-fit items-center justify-start pt-[7px] pb-[14px] pl-[18px]"
      data-testid="spielwiese-message-insert-row"
    >
      <div className="bg-background inline-flex h-7 items-center overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] shadow-[0_1px_0_rgba(255,255,255,0.5)_inset]">
        <Button
          aria-controls={`${nodeId}-message-insert-picker`}
          aria-expanded={isPickerOpen}
          className="text-foreground/78 hover:text-foreground h-full rounded-none border-0 bg-transparent px-3 text-[13px] font-medium shadow-none transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-transparent active:scale-[0.985]"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setIsPickerOpen((currentValue) => !currentValue)}
        >
          New message
        </Button>
        <SpielwieseMessageInsertPicker
          isOpen={isPickerOpen}
          nodeId={nodeId}
          onClose={closePicker}
          onPromptSectionInsert={onPromptSectionInsert}
        />
      </div>
    </div>
  );
}
