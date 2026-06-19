import { useState } from "react";
import { Braces, Check, ChevronDown, Pencil } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { cn } from "@/src/utils/tailwind";
import { api } from "@/src/utils/api";
import { ObservationIoParserDrawer } from "./ObservationIoParserDrawer";

export function ObservationIoParserSelector({
  projectId,
}: {
  projectId: string;
}) {
  const utils = api.useUtils();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const configs = api.observationIoParsers.list.useQuery({ projectId });
  const projectPreference =
    api.observationIoParsers.getProjectPreference.useQuery({
      projectId,
    });
  const userPreference = api.observationIoParsers.getUserPreference.useQuery({
    projectId,
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "observationIoParsers:CUD",
  });

  const updatePreference =
    api.observationIoParsers.setUserPreference.useMutation({
      onSuccess: async () => {
        await Promise.all([
          utils.observationIoParsers.getUserPreference.invalidate({
            projectId,
          }),
          utils.observationIoParsers.getProjectPreference.invalidate({
            projectId,
          }),
          utils.events.parsedObservationIO.invalidate(),
        ]);
      },
    });

  const activeConfigs =
    configs.data
      ?.filter((config) => config.enabled)
      .sort((a, b) => a.priority - b.priority) ?? [];

  if (activeConfigs.length === 0) {
    return null;
  }

  const selectedConfigId =
    activeConfigs.find(
      (config) => config.id === userPreference.data?.selectedConfigId,
    )?.id ??
    activeConfigs.find(
      (config) => config.id === projectPreference.data?.selectedConfigId,
    )?.id ??
    activeConfigs[0]?.id ??
    "";
  const selectedConfig = activeConfigs.find(
    (config) => config.id === selectedConfigId,
  );
  const isProjectEnabled = projectPreference.data?.enabled ?? false;
  const isEnabled = isProjectEnabled && (userPreference.data?.enabled ?? true);
  const isPending =
    updatePreference.isPending ||
    userPreference.isLoading ||
    projectPreference.isLoading;

  const setPreference = ({
    enabled,
    selectedConfigId,
  }: {
    enabled: boolean;
    selectedConfigId?: string;
  }) => {
    updatePreference.mutate({
      projectId,
      enabled,
      ...(selectedConfigId !== undefined ? { selectedConfigId } : {}),
    });
  };

  return (
    <div className="mr-1 flex items-center gap-1.5">
      <Switch
        size="sm"
        checked={isEnabled}
        disabled={isPending || !isProjectEnabled}
        onCheckedChange={(enabled) => setPreference({ enabled })}
      />
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            disabled={!isEnabled || isPending}
            className="h-7 max-w-44 min-w-34 justify-between gap-1 px-2 text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Braces className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {selectedConfig?.name ?? "Select parser"}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {activeConfigs.map((config) => {
            const isSelected = config.id === selectedConfigId;

            return (
              <div
                key={config.id}
                className="focus-within:bg-accent hover:bg-accent flex items-center rounded-sm"
              >
                <DropdownMenuItem
                  className="min-w-0 flex-1 gap-2 rounded-r-none pr-1"
                  onSelect={() =>
                    setPreference({
                      enabled: true,
                      selectedConfigId: config.id,
                    })
                  }
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{config.name}</span>
                </DropdownMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="mr-1 h-6 w-6 shrink-0"
                      disabled={!hasWriteAccess}
                      aria-label={`Edit ${config.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsMenuOpen(false);
                        setEditingConfigId(config.id);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit parser</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <ObservationIoParserDrawer
        projectId={projectId}
        trigger={null}
        editConfigId={editingConfigId}
        onEditConfigIdChange={setEditingConfigId}
      />
    </div>
  );
}
