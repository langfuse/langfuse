import { Slot } from "@radix-ui/react-slot";
import { Check, LoaderCircle, Search as SearchIcon } from "@langfuse/icons";
import {
  type ComponentProps,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { useScrollGradients } from "@/src/hooks/useScrollGradients";
import { cn } from "@/src/utils/tailwind";
import { Checkbox } from "../../Checkbox/Checkbox";
import { Badge } from "../../Badge/Badge";
import { DropdownIndicator } from "../../DropdownIndicator/DropdownIndicator";
import { markerColors } from "../../Tag/Tag";

type SlottedProps = Omit<ComponentPropsWithoutRef<typeof Slot>, "className">;

function Content({
  width,
  ...props
}: SlottedProps & {
  width:
    | "popover-trigger"
    | "popover-wide"
    | "popover-extra-wide"
    | "select-trigger";
}) {
  return (
    <Slot
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative min-w-32 overflow-hidden rounded-md border shadow-md outline-hidden",
        width === "popover-trigger" && "w-(--radix-popover-trigger-width)",
        width === "popover-wide" &&
          "w-[min(max(24rem,var(--radix-popover-trigger-width)),var(--radix-popover-content-available-width))] min-w-0",
        width === "popover-extra-wide" &&
          "w-[min(max(32rem,var(--radix-popover-trigger-width)),var(--radix-popover-content-available-width))] min-w-0",
        width === "select-trigger" &&
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 w-(--radix-select-trigger-width)",
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
      <SearchIcon size="base" __rawClassName="opacity-50" />
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

function Group({
  label,
  children,
  count,
  caption,
  ...expansion
}: {
  label: string;
  children: ReactNode;
  count?: number;
  caption?: { text: string; description: string };
} & (
  | { expanded?: never; onExpandedChange?: never }
  | { expanded: boolean; onExpandedChange?: (expanded: boolean) => void }
)) {
  if (expansion.expanded === undefined) {
    return <Slot aria-label={label}>{children}</Slot>;
  }

  const { expanded, onExpandedChange } = expansion;
  return (
    <>
      <button
        type="button"
        disabled={!onExpandedChange}
        aria-expanded={expanded}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.stopPropagation();
        }}
        onClick={() => onExpandedChange?.(!expanded)}
        className="bg-muted/40 enabled:hover:bg-muted flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs disabled:cursor-default"
      >
        {onExpandedChange && (
          <DropdownIndicator
            size="sm"
            direction={expanded ? "down" : "right"}
          />
        )}
        <span className="truncate font-medium" title={label}>
          {label}
        </span>
        <span>{count}</span>
        {caption && (
          <span
            title={caption.description}
            className="text-muted-foreground ml-auto shrink-0 italic"
          >
            {caption.text}
          </span>
        )}
      </button>
      {expanded && <Slot aria-label={label}>{children}</Slot>}
    </>
  );
}

function Loading({ message }: { message: string }) {
  return (
    <Option highlight="aria-selected">
      <div aria-disabled="true">
        <span role="status" className="contents">
          <span className="flex w-3.5 shrink-0 items-center justify-center">
            <LoaderCircle
              size="base"
              aria-hidden
              __rawClassName="animate-spin"
            />
          </span>
          {message}
        </span>
      </div>
    </Option>
  );
}

type OptionContentProps = {
  label: ReactNode;
  secondaryLabel?: string;
  markerColor?: keyof typeof markerColors;
  /** Trailing metadata pills that truncate to preserve room for the label. */
  badges?: readonly Pick<ComponentProps<typeof Badge>, "text" | "title">[];
  title: string;
  checked: boolean;
};

function SingleSelectOptionContent({ checked, ...props }: OptionContentProps) {
  return (
    <>
      <OptionLabel {...props} />
      <OptionIndicator hasBadges={(props.badges?.length ?? 0) > 0}>
        <Check
          aria-hidden="true"
          size="base"
          __rawClassName={cn(checked ? "opacity-100" : "opacity-0")}
        />
      </OptionIndicator>
    </>
  );
}

function MultiSelectOptionContent({ checked, ...props }: OptionContentProps) {
  return (
    <>
      <OptionIndicator hasBadges={(props.badges?.length ?? 0) > 0} leading>
        <Checkbox
          checked={checked}
          size="sm"
          tabIndex={-1}
          aria-hidden="true"
        />
      </OptionIndicator>
      <OptionLabel {...props} />
    </>
  );
}

function OptionLabel({
  label,
  secondaryLabel,
  markerColor,
  badges,
  title,
}: Omit<OptionContentProps, "checked">) {
  return (
    <>
      <span className="@container flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "flex min-w-0 flex-initial items-center gap-1.5",
            Boolean(badges?.length) && "min-w-[min(50%,12ch)]",
          )}
        >
          {markerColor && (
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                markerColors[markerColor],
              )}
            />
          )}
          <span className="min-w-0 truncate" title={title}>
            {label}
          </span>
        </span>
        {Boolean(badges?.length) && (
          <span className="hidden min-w-0 items-center gap-2 @min-[8.5rem]:flex">
            {badges?.map((badge, index) => (
              <span key={index} className="flex min-w-0">
                <Badge color="filled" size="sm" {...badge} />
              </span>
            ))}
          </span>
        )}
      </span>
      {secondaryLabel && (
        <span
          className="text-muted-foreground shrink-0 self-start whitespace-nowrap"
          title={title}
        >
          {secondaryLabel}
        </span>
      )}
    </>
  );
}

function OptionIndicator({
  hasBadges,
  leading,
  children,
}: {
  hasBadges: boolean;
  leading?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none flex w-3.5 shrink-0 items-center justify-center",
        // A badged row can wrap to two or three lines. Centring the indicator
        // against the whole block would float it down level with the badges,
        // away from the label it marks — so pin it to the first line's box
        // (h-5 matches the row's text-sm line height) instead.
        hasBadges ? "h-5 self-start" : "h-3.5",
        // Ahead of any icon the caller renders before the option content.
        leading && "order-first",
      )}
    >
      {children}
    </span>
  );
}

export const InputDropdown = {
  Group,
  Content,
  Empty,
  List,
  Loading,
  MultiSelectOptionContent,
  Option,
  Root,
  Search,
  SingleSelectOptionContent,
};
