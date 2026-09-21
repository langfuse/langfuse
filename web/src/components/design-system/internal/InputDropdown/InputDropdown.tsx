import { Slot } from "@radix-ui/react-slot";
import { Check, Search as SearchIcon } from "lucide-react";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

import { useScrollGradients } from "@/src/hooks/useScrollGradients";
import { cn } from "@/src/utils/tailwind";

type SlottedProps = Omit<ComponentPropsWithoutRef<typeof Slot>, "className">;

function Content({
  width,
  ...props
}: SlottedProps & {
  width: "popover-trigger" | "select-trigger";
}) {
  return (
    <Slot
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative min-w-32 overflow-hidden rounded-md border shadow-md outline-hidden",
        width === "popover-trigger"
          ? "w-(--radix-popover-trigger-width)"
          : "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 w-(--radix-select-trigger-width)",
      )}
      {...props}
    />
  );
}

function Root({ ...props }: SlottedProps) {
  return (
    <Slot
      className="bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md"
      {...props}
    />
  );
}

function Search({ ...props }: SlottedProps) {
  return (
    <div className="flex items-center border-b px-2">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <Slot
        className="placeholder:text-foreground-tertiary flex h-8 w-full rounded border-transparent bg-transparent px-2 py-3 text-sm outline-hidden focus:border-0 focus:border-none focus:border-transparent focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
    </div>
  );
}

function Empty({ ...props }: SlottedProps) {
  return <Slot className="py-6 text-center text-sm" {...props} />;
}

function List({ ...props }: SlottedProps) {
  const { register, recompute, top, bottom } =
    useScrollGradients<HTMLDivElement>(true);

  return (
    <div className="relative overflow-hidden">
      <Slot
        ref={register}
        onScroll={recompute}
        className="max-h-96 overflow-auto p-1.5"
        {...props}
      />
      <div
        className={cn(
          "from-popover pointer-events-none absolute inset-x-0 top-0 z-2 h-6 bg-linear-to-b to-transparent",
          top ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "from-popover pointer-events-none absolute inset-x-0 bottom-0 z-2 h-6 bg-linear-to-t to-transparent",
          bottom ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function Option({
  highlight,
  checked,
  ...props
}: SlottedProps & {
  highlight: "aria-selected" | "focus";
  checked?: boolean;
}) {
  return (
    <Slot
      data-checked={checked}
      className={cn(
        "data-[checked=true]:bg-accent data-[checked=true]:text-accent-foreground relative flex w-full cursor-pointer items-center rounded-sm px-1.5 py-1.5 text-sm outline-hidden select-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[checked=true]:font-bold",
        highlight === "aria-selected"
          ? "aria-selected:bg-accent aria-selected:text-accent-foreground"
          : "focus:bg-accent focus:text-accent-foreground data-disabled:opacity-50",
      )}
      {...props}
    />
  );
}

function OptionContent({
  label,
  secondaryLabel,
  title,
  indicator,
}: {
  label: ReactNode;
  secondaryLabel?: string;
  title: string;
  indicator: ReactNode;
}) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate" title={title}>
        {label}
        {secondaryLabel && (
          <span className="text-muted-foreground ml-1">{secondaryLabel}</span>
        )}
      </span>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {indicator}
      </span>
    </>
  );
}

function CheckIndicator({ checked }: { checked: boolean }) {
  return (
    <Check className={cn("size-4", checked ? "opacity-100" : "opacity-0")} />
  );
}

export const InputDropdown = {
  CheckIndicator,
  Content,
  Empty,
  List,
  Option,
  OptionContent,
  Root,
  Search,
};
