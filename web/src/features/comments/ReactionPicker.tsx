import { Popover, PopoverContent } from "@/src/components/ui/popover";
import { type ReactNode, useState } from "react";
import { EmojiPicker } from "@ferrucc-io/emoji-picker";

interface ReactionPickerProps {
  children: ReactNode;
  onEmojiSelect: (emoji: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ReactionPicker({
  children,
  onEmojiSelect,
  open,
  defaultOpen = false,
  onOpenChange,
}: ReactionPickerProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? internalOpen;

  const changeOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Popover open={resolvedOpen} onOpenChange={changeOpen}>
      {children}
      <PopoverContent
        className="w-fit border-none bg-transparent p-0"
        align="start"
      >
        <EmojiPicker
          onEmojiSelect={(emoji) => {
            onEmojiSelect(emoji);
            changeOpen(false);
          }}
          className="h-[320px] w-[320px]"
        >
          <EmojiPicker.Header className="border-b px-2 py-2">
            <EmojiPicker.Input
              placeholder="Search emoji..."
              className="focus:border-primary w-full rounded border py-1 text-sm outline-hidden"
            />
          </EmojiPicker.Header>
          <EmojiPicker.Group className="overflow-y-auto overscroll-contain">
            <EmojiPicker.List containerHeight={256} />
          </EmojiPicker.Group>
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  );
}
