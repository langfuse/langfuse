import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { SmilePlusIcon } from "lucide-react";
import { useState } from "react";
import { EmojiPicker } from "@ferrucc-io/emoji-picker";

interface ReactionPickerProps {
  onEmojiSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function ReactionPicker({
  onEmojiSelect,
  disabled = false,
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-xs opacity-50 transition-opacity hover:opacity-100"
          disabled={disabled}
        >
          <SmilePlusIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-fit border-none bg-transparent p-0"
        align="start"
      >
        <EmojiPicker
          onEmojiSelect={(emoji) => {
            onEmojiSelect(emoji);
            setOpen(false);
          }}
          className="h-[320px] w-[320px]"
        >
          <EmojiPicker.Header className="border-b px-2 py-2">
            <EmojiPicker.Input
              placeholder="Search emoji..."
              className="w-full rounded border py-1 text-sm outline-none focus:border-primary"
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
