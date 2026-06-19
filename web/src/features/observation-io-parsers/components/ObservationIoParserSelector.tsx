import { useState } from "react";
import { Braces, Check, ChevronDown, Pencil, Settings } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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

  const selectedConfigId =
    activeConfigs.find(
      (config) => config.id === userPreference.data?.selectedConfigId,
    )?.id ??
    activeConfigs.find(
      (config) =>
        projectPreference.data?.enabled &&
        config.id === projectPreference.data.selectedConfigId,
    )?.id ??
    null;
  const selectedConfig = activeConfigs.find(
    (config) => config.id === selectedConfigId,
  );
  const configCount = configs.data?.length ?? 0;
  const hasActiveConfigs = activeConfigs.length > 0;
  const isEnabled = userPreference.data?.enabled ?? true;
  const isPending =
    updatePreference.isPending ||
    configs.isLoading ||
    userPreference.isLoading ||
    projectPreference.isLoading;
  const selectedLabel =
    selectedConfig?.name ??
    (hasActiveConfigs
      ? "Auto match"
      : configCount > 0
        ? "No active parsers"
        : "No parsers");

  const setPreference = ({
    enabled,
    selectedConfigId,
  }: {
    enabled: boolean;
    selectedConfigId?: string | null;
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
        disabled={isPending}
        onCheckedChange={(enabled) => setPreference({ enabled })}
      />
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            disabled={isPending}
            className="h-7 max-w-44 min-w-34 justify-between gap-1 px-2 text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Braces className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{selectedLabel}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {hasActiveConfigs ? (
            <>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() =>
                  setPreference({
                    enabled: true,
                    selectedConfigId: null,
                  })
                }
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    selectedConfigId === null ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">Auto match</span>
              </DropdownMenuItem>
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
              <DropdownMenuSeparator />
            </>
          ) : (
            <DropdownMenuItem disabled className="gap-2">
              <Check className="h-3.5 w-3.5 shrink-0 opacity-0" />
              <span className="truncate">
                {configCount > 0 ? "No active parsers" : "No parsers"}
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => {
              setIsMenuOpen(false);
              setIsDrawerOpen(true);
            }}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Manage parsers</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ObservationIoParserDrawer
        projectId={projectId}
        trigger={null}
        editConfigId={editingConfigId}
        onEditConfigIdChange={setEditingConfigId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </div>
  );
}
