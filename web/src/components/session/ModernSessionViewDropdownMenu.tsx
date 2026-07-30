import { type TableViewPresetState } from "@langfuse/shared";
import { Check, Filter, Save, Settings2 } from "lucide-react";

import { SESSION_DETAIL_SYSTEM_PRESETS } from "@/src/components/session/session-detail-presets";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";

export type ModernSessionViewDropdownMenuControls = {
  matchingSystemPresetId: string | undefined;
  matchingSavedViewId: string | undefined;
  savedViews: Array<TableViewPresetState & { id: string; name: string }>;
  onApplyPreset: (
    preset: (typeof SESSION_DETAIL_SYSTEM_PRESETS)[number],
  ) => void;
  onApplySavedView: (
    view: TableViewPresetState & { id: string; name: string },
  ) => void;
  onManageViews: () => void;
  onOpenFilterDialog: () => void;
};

export function ModernSessionViewDropdownMenu({
  controls,
}: {
  controls: ModernSessionViewDropdownMenuControls;
}) {
  return (
    <DropdownMenuContent align="end" className="w-72">
      <DropdownMenuLabel>Presets</DropdownMenuLabel>
      {SESSION_DETAIL_SYSTEM_PRESETS.map((preset) => (
        <DropdownMenuItem
          key={preset.id}
          onSelect={() => controls.onApplyPreset(preset)}
          className="items-start gap-2"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm">{preset.name}</span>
            {preset.description ? (
              <span className="text-muted-foreground block text-xs">
                {preset.description}
              </span>
            ) : null}
          </span>
          {controls.matchingSystemPresetId === preset.id ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : null}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Save className="mr-2 h-4 w-4" />
          Saved Views
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {controls.savedViews.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onSelect={() => controls.onApplySavedView(view)}
            >
              <span className="min-w-0 flex-1 truncate" title={view.name}>
                {view.name}
              </span>
              {controls.matchingSavedViewId === view.id ? (
                <Check className="ml-2 h-4 w-4 shrink-0" />
              ) : null}
            </DropdownMenuItem>
          ))}
          {controls.savedViews.length === 0 ? (
            <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={controls.onManageViews}>
            <Settings2 className="mr-2 h-4 w-4" />
            Manage Views
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={controls.onOpenFilterDialog}>
        <Filter className="mr-2 h-4 w-4" />
        Apply custom filter
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
