import { useState } from "react";
import { EmojiPicker } from "@ferrucc-io/emoji-picker";

import { PopoverController } from "@/src/components/design-system/PopoverController/PopoverController";

interface ReactionPickerProps {
  children: React.ComponentProps<typeof PopoverController>["children"];
  onEmojiSelect: (emoji: string) => void;
}

export function ReactionPicker({
  children,
  onEmojiSelect,
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <PopoverController
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      content={
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
              className="focus:border-primary w-full rounded border py-1 text-sm outline-hidden"
            />
          </EmojiPicker.Header>
          <EmojiPicker.Group className="overflow-y-auto overscroll-contain">
            <EmojiPicker.List containerHeight={256} />
          </EmojiPicker.Group>
        </EmojiPicker>
      }
    >
      {children}
    </PopoverController>
  );
}
