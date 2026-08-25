import { Button, type ButtonProps } from "@/src/components/ui/button";
import { ChevronDown, ListPlus } from "lucide-react";

type AnnotationQueueItemTriggerProps = {
  layout: "toolbar" | "menu";
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
  disabled: boolean;
  totalCount: number;
};

export function AnnotationQueueItemTrigger({
  layout,
  variant,
  size,
  disabled,
  totalCount,
}: AnnotationQueueItemTriggerProps) {
  const isMenu = layout === "menu";
  const count = totalCount > 99 ? "99+" : totalCount;

  return (
    <Button
      variant={isMenu ? "ghost" : variant}
      size={isMenu ? "sm" : size}
      disabled={disabled}
      className={
        isMenu
          ? "w-full justify-start gap-2 font-normal"
          : "rounded-l-none rounded-r-md border-l-2"
      }
    >
      {isMenu ? (
        <>
          <ListPlus className="h-4 w-4" />
          <span className="text-sm">Add to queue</span>
          {totalCount > 0 ? (
            <span className="bg-primary/50 text-primary-foreground ml-auto flex h-3.5 w-fit items-center justify-center rounded-sm px-1 text-xs shadow-xs">
              {count}
            </span>
          ) : null}
        </>
      ) : totalCount > 0 ? (
        <span className="relative mr-1 text-xs">
          <ChevronDown className="text-secondary-foreground h-3 w-3" />
          <span className="bg-primary text-primary-foreground absolute -top-1 left-2.5 flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[8px] font-bold shadow-xs">
            {count}
          </span>
        </span>
      ) : (
        <span className="relative mr-1 text-xs">
          <ChevronDown className="h-3 w-3" />
        </span>
      )}
    </Button>
  );
}
