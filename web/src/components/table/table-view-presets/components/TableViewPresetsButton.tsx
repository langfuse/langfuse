import type { ComponentProps } from "react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

type TableViewPresetsButtonProps = Pick<
  ComponentProps<typeof Button>,
  | "id"
  | "ref"
  | "onClick"
  | "onPointerDown"
  | "onKeyDown"
  | "aria-expanded"
  | "aria-controls"
  | "aria-haspopup"
> & {
  selectedView: {
    name: string;
    defaultLabel: "Your default" | "Project default" | null;
  } | null;
  count: number;
  /** `large` matches the 36px large search bar when sharing its row. */
  size?: "default" | "large";
};

export function TableViewPresetsButton({
  selectedView,
  count,
  size = "default",
  ...props
}: TableViewPresetsButtonProps) {
  const label = selectedView?.name ?? "My Views";
  const title = selectedView?.defaultLabel
    ? `${label} (${selectedView.defaultLabel})`
    : label;

  return (
    <Button
      {...props}
      variant={selectedView ? "default" : "outline"}
      className={cn("max-w-64 gap-1.5", size === "large" && "h-9")}
      title={title}
    >
      <span className="truncate" title={title}>
        {label}
      </span>
      {selectedView ? (
        <DropdownIndicator nudge />
      ) : (
        <span className="bg-input rounded-sm px-1 text-xs">{count}</span>
      )}
    </Button>
  );
}
