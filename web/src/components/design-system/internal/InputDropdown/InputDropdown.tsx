import { Slot } from "@radix-ui/react-slot";
import { Check, Search as SearchIcon } from "lucide-react";
import { type ComponentPropsWithoutRef, type ReactNode, useMemo } from "react";

import { useScrollGradients } from "@/src/hooks/useScrollGradients";
import { cn } from "@/src/utils/tailwind";
import { Checkbox } from "../../Checkbox/Checkbox";

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
      <SearchIcon className="icon-base shrink-0 opacity-50" />
      <Slot
        className="placeholder:text-muted-foreground flex h-8 w-full rounded border-transparent bg-transparent px-2 py-3 text-sm outline-hidden focus:border-0 focus:border-none focus:border-transparent focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
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
        "relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm outline-hidden select-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
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
  badges,
  title,
  type,
  checked,
}: {
  label: ReactNode;
  secondaryLabel?: string;
  /**
   * Trailing metadata pills. They share the label's line while it fits and wrap
   * beneath it when it does not, so the label — the thing the option is picked
   * by — is never the only item that can give up space.
   */
  badges?: ReactNode;
  title: string;
  type: "checkbox" | "checkmark" | "radio";
  checked: boolean;
}) {
  const indicator = useMemo(() => {
    if (type === "checkbox") {
      return (
        <Checkbox
          checked={checked}
          size="sm"
          tabIndex={-1}
          aria-hidden="true"
        />
      );
    }
    if (type === "radio") {
      return (
        <span
          aria-hidden="true"
          className={cn(
            "border-control-border flex size-3.5 items-center justify-center rounded-full border shadow-sm",
            checked && "border-control-fill",
          )}
        >
          {checked && (
            <span className="bg-control-fill size-1.5 rounded-full" />
          )}
        </span>
      );
    }
    return (
      <Check
        aria-hidden="true"
        className={cn("icon-base", checked ? "opacity-100" : "opacity-0")}
      />
    );
  }, [type, checked]);

  return (
    <>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {/*
          `flex-auto`, not `flex-1`: the basis must stay `auto` so the label's
          own width is what decides whether the badges still fit on this line
          (a `flex-1` basis of 0 would let everything share one line forever,
          which is the bug). Growing from that basis keeps the label filling
          the row when it does fit, which is what holds the badges against the
          right edge and keeps `title` hoverable across the whole row.
        */}
        <span className="flex-auto truncate" title={title}>
          {label}
          {secondaryLabel && (
            <span className="text-muted-foreground ml-1">{secondaryLabel}</span>
          )}
        </span>
        {badges}
      </span>
      <span
        className={cn(
          "pointer-events-none flex w-3.5 shrink-0 items-center justify-center",
          // A badged row can wrap to two or three lines. Centring the indicator
          // against the whole block would float it down level with the badges,
          // away from the label it marks — so pin it to the first line's box
          // (h-5 matches the row's text-sm line height) instead.
          badges ? "h-5 self-start" : "h-3.5",
          (type === "checkbox" || type === "radio") && "order-first",
        )}
      >
        {indicator}
      </span>
    </>
  );
}

export const InputDropdown = {
  Content,
  Empty,
  List,
  Option,
  OptionContent,
  Root,
  Search,
};
