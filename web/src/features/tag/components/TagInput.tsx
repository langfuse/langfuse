import React from "react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { Command as CommandPrimitive } from "cmdk";

type TagInputProps = React.ComponentPropsWithoutRef<
  typeof CommandPrimitive.Input
> & {
  selectedTags: string[];
  setSelectedTags?: (tags: string[]) => void;
};

export const TagInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  TagInputProps
>(({ className, selectedTags, ...props }, ref) => {
  return (
    <div
      className="flex flex-wrap items-center overflow-auto rounded-lg border px-2"
      cmdk-input-wrapper=""
    >
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
          {selectedTags.map((tag: string) => (
            <Button
              key={tag}
              variant="tertiary"
              size="icon-sm"
              disabled
              className="cursor-default"
            >
              {tag}
            </Button>
          ))}
        </div>
      )}
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          "placeholder:muted-foreground flex h-8 w-full rounded-md border-transparent bg-transparent px-1 text-sm outline-none focus:border-0 focus:border-none focus:border-transparent focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        autoFocus
        {...props}
      />
    </div>
  );
});

TagInput.displayName = CommandPrimitive.Input.displayName;
