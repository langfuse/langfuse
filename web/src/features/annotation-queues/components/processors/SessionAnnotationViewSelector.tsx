import { Check, ListFilter } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  SESSION_DETAIL_SYSTEM_PRESETS,
  SESSION_DETAIL_VIEW_TRIGGER_ID,
} from "@/src/features/sessions";
import { type SessionAnnotationSavedView } from "./sessionAnnotationView";
import { cn } from "@/src/utils/tailwind";

type SessionAnnotationViewSelectorProps = {
  selectedViewId: string | null;
  savedViews: SessionAnnotationSavedView[];
  activeViewName: string | null;
  onSelect: (viewId: string | null) => void;
};

export function SessionAnnotationViewSelector({
  selectedViewId,
  savedViews,
  activeViewName,
  onSelect,
}: SessionAnnotationViewSelectorProps) {
  const triggerLabel = activeViewName ?? "Default view";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={SESSION_DETAIL_VIEW_TRIGGER_ID}
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label="Select session view"
          title={
            activeViewName
              ? `Session view: ${activeViewName}`
              : "Session view: default (all observations)"
          }
        >
          <ListFilter className="icon-base text-icon-foreground" />
          <span className="max-w-44 truncate">{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Session view</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => onSelect(null)}
          className={cn(
            "flex items-center justify-between",
            selectedViewId === null && "font-bold",
          )}
        >
          <span>Default (all observations)</span>
          {selectedViewId === null ? (
            <Check
              className="icon-base shrink-0"
              aria-label="Default selected"
            />
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>System presets</DropdownMenuLabel>
        {SESSION_DETAIL_SYSTEM_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            title={preset.description}
            className={cn(
              "flex items-center justify-between",
              selectedViewId === preset.id && "font-bold",
            )}
          >
            <span className="truncate">{preset.name}</span>
            {selectedViewId === preset.id ? (
              <Check
                className="icon-base shrink-0"
                aria-label={`${preset.name} selected`}
              />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {savedViews.map((view) => (
          <DropdownMenuItem
            key={view.id}
            onClick={() => onSelect(view.id)}
            className={cn(
              "flex items-center justify-between",
              selectedViewId === view.id && "font-bold",
            )}
          >
            <span className="truncate">{view.name}</span>
            {selectedViewId === view.id ? (
              <Check
                className="icon-base shrink-0"
                aria-label={`${view.name} selected`}
              />
            ) : null}
          </DropdownMenuItem>
        ))}
        {savedViews.length === 0 ? (
          <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
