import { useMemo, useState } from "react";
import { Braces, Check, ChevronDown, Lock, Pencil, Plus } from "lucide-react";
import {
  eventsTableCols,
  OBSERVATION_IO_PARSER_BLOCKED_FILTER_COLUMNS,
  OBSERVATION_IO_PARSER_SUPPORTED_FILTER_COLUMNS,
  type ColumnDefinition,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
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
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { cn } from "@/src/utils/tailwind";
import { api, type RouterOutputs } from "@/src/utils/api";
import { ParserStudioPanel } from "@/src/features/observation-io-parsers/components/ParserStudioPanel";
import {
  createDraft,
  draftFromConfig,
  type ObservationIoParserConfig,
  type ParserDraft,
} from "@/src/features/observation-io-parsers/lib/parserDraft";

const filterOptionColumns = new Set([
  "id",
  "name",
  "type",
  "environment",
  "level",
  "providedModelName",
  "modelId",
  "promptName",
  "traceTags",
  "traceName",
  "userId",
  "sessionId",
  "version",
  "toolNames",
  "calledToolNames",
]);

const getFilterOptionValues = (
  options: RouterOutputs["events"]["filterOptions"] | undefined,
  columnId: string,
) => {
  if (!options || !filterOptionColumns.has(columnId)) return undefined;
  return options[columnId as keyof typeof options] as
    | Array<{ value: string; count?: number; displayValue?: string }>
    | undefined;
};

const getParserFilterColumns = (
  options: RouterOutputs["events"]["filterOptions"] | undefined,
): ColumnDefinition[] =>
  eventsTableCols
    .filter(
      (column) =>
        OBSERVATION_IO_PARSER_SUPPORTED_FILTER_COLUMNS.has(column.id) &&
        !OBSERVATION_IO_PARSER_BLOCKED_FILTER_COLUMNS.has(column.id),
    )
    .map((column) => {
      if (column.type !== "stringOptions" && column.type !== "arrayOptions") {
        return column;
      }

      return {
        ...column,
        options: getFilterOptionValues(options, column.id) ?? [],
      };
    });

export function ObservationIoParserSelector({
  projectId,
  currentFilters = [],
  appliedConfig = null,
}: {
  projectId: string;
  currentFilters?: FilterState;
  appliedConfig?: { id: string; name: string } | null;
}) {
  const utils = api.useUtils();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [draft, setDraft] = useState<ParserDraft | null>(null);
  const configs = api.observationIoParsers.list.useQuery({ projectId });
  const projectPreference =
    api.observationIoParsers.getProjectPreference.useQuery({
      projectId,
    });
  const userPreference = api.observationIoParsers.getUserPreference.useQuery({
    projectId,
  });
  const startTimeFilters = useMemo(
    () =>
      currentFilters.filter(
        (filter): filter is TimeFilter =>
          (filter.column === "Start Time" || filter.column === "startTime") &&
          filter.type === "datetime",
      ),
    [currentFilters],
  );
  const filterOptions = api.events.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter:
        startTimeFilters.length > 0 ? startTimeFilters : undefined,
    },
    {
      enabled: Boolean(draft),
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      placeholderData: (previousData) => previousData,
    },
  );
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "observationIoParsers:CUD",
  });

  const invalidate = async () => {
    await Promise.all([
      utils.observationIoParsers.invalidate(),
      utils.events.parsedObservationIO.invalidate(),
    ]);
  };

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
      onError: (error) =>
        showErrorToast("Failed to update parser preference", error.message),
    });

  const createMutation = api.observationIoParsers.create.useMutation({
    onSuccess: async (data) => {
      await invalidate();
      setDraft(null);
      if (data.config.enabled) {
        updatePreference.mutate({
          projectId,
          enabled: true,
          selectionMode: "config",
          selectedConfigId: data.config.id,
        });
      }
      showSuccessToast({
        title: "Parser created",
        description: "Observation IO parser saved.",
      });
    },
    onError: (error) =>
      showErrorToast("Failed to create parser", error.message),
  });

  const updateMutation = api.observationIoParsers.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setDraft(null);
      showSuccessToast({
        title: "Parser updated",
        description: "Observation IO parser saved.",
      });
    },
    onError: (error) =>
      showErrorToast("Failed to update parser", error.message),
  });

  const deleteMutation = api.observationIoParsers.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      setDraft(null);
      showSuccessToast({
        title: "Parser deleted",
        description: "Observation IO parser removed.",
      });
    },
    onError: (error) =>
      showErrorToast("Failed to delete parser", error.message),
  });

  const configsByPriority = useMemo(
    () => [...(configs.data ?? [])].sort((a, b) => a.priority - b.priority),
    [configs.data],
  );
  const activeConfigs = useMemo(
    () => configsByPriority.filter((config) => config.enabled),
    [configsByPriority],
  );
  const parserFilterColumns = useMemo(
    () => getParserFilterColumns(filterOptions.data),
    [filterOptions.data],
  );

  const userSelectionMode = userPreference.data?.selectionMode ?? "inherit";
  const projectSelectedConfigId =
    projectPreference.data?.enabled &&
    projectPreference.data.selectionMode === "config"
      ? projectPreference.data.selectedConfigId
      : null;
  const selectedConfigId =
    userSelectionMode === "config"
      ? (activeConfigs.find(
          (config) => config.id === userPreference.data?.selectedConfigId,
        )?.id ?? null)
      : userSelectionMode === "auto"
        ? null
        : (activeConfigs.find((config) => config.id === projectSelectedConfigId)
            ?.id ?? null);
  const selectedConfig = activeConfigs.find(
    (config) => config.id === selectedConfigId,
  );
  const appliedParserConfig = appliedConfig
    ? (configsByPriority.find((config) => config.id === appliedConfig.id) ??
      appliedConfig)
    : null;
  const configCount = configs.data?.length ?? 0;
  const hasActiveConfigs = activeConfigs.length > 0;
  const isEnabled = userPreference.data?.enabled ?? true;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isPending =
    updatePreference.isPending ||
    configs.isLoading ||
    userPreference.isLoading ||
    projectPreference.isLoading;
  const selectedLabel = !isEnabled
    ? "Disabled"
    : (appliedParserConfig?.name ??
      selectedConfig?.name ??
      (hasActiveConfigs
        ? "Auto match"
        : configCount > 0
          ? "No active parsers"
          : "No parsers"));

  const setPreference = ({
    enabled,
    selectionMode,
    selectedConfigId,
  }: {
    enabled: boolean;
    selectionMode?: "inherit" | "auto" | "config";
    selectedConfigId?: string | null;
  }) => {
    updatePreference.mutate({
      projectId,
      enabled,
      ...(selectionMode !== undefined ? { selectionMode } : {}),
      ...(selectedConfigId !== undefined ? { selectedConfigId } : {}),
    });
  };

  const openCreateParser = () => {
    setIsMenuOpen(false);
    setDraft(createDraft(currentFilters, configsByPriority.length));
  };

  const openEditParser = (config: ObservationIoParserConfig) => {
    setIsMenuOpen(false);
    setDraft(draftFromConfig(config));
  };

  const saveDraft = () => {
    if (!draft) return;

    const payload = {
      projectId,
      name: draft.name,
      description: draft.description || null,
      enabled: draft.enabled,
      priority: draft.priority,
      filters: draft.filters,
      instructions: {
        version: 1 as const,
        sourceRepresentation: draft.sourceRepresentation,
        fields: draft.fields.map(({ id: _id, ...field }) => field),
      },
    };

    if (draft.id) {
      updateMutation.mutate({ ...payload, id: draft.id });
    } else {
      createMutation.mutate(payload);
    }
  };

  const deleteDraft = () => {
    if (!draft?.id) return;
    if (!window.confirm(`Delete ${draft.name}?`)) return;

    deleteMutation.mutate({
      projectId,
      id: draft.id,
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
        <DropdownMenuContent align="start" className="w-72">
          {hasActiveConfigs ? (
            <DropdownMenuItem
              className="gap-2"
              onSelect={() =>
                setPreference({
                  enabled: true,
                  selectionMode: "auto",
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
          ) : null}

          {configsByPriority.length > 0 ? (
            configsByPriority.map((config) => {
              const isSelected = config.id === selectedConfigId;
              const isApplied = config.id === appliedParserConfig?.id;

              return (
                <div
                  key={config.id}
                  className={cn(
                    "focus-within:bg-accent hover:bg-accent flex items-center rounded-sm",
                    isApplied && "bg-accent",
                  )}
                >
                  <DropdownMenuItem
                    disabled={!config.enabled}
                    className="min-w-0 flex-1 gap-2 rounded-r-none pr-1"
                    onSelect={() =>
                      setPreference({
                        enabled: true,
                        selectionMode: "config",
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
                    {isApplied ? (
                      <Badge variant="outline" size="sm" className="ml-auto">
                        Applied
                      </Badge>
                    ) : !config.enabled ? (
                      <Badge variant="secondary" size="sm" className="ml-auto">
                        Off
                      </Badge>
                    ) : null}
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
                          openEditParser(config);
                        }}
                      >
                        {hasWriteAccess ? (
                          <Pencil className="h-3.5 w-3.5" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit parser</TooltipContent>
                  </Tooltip>
                </div>
              );
            })
          ) : (
            <DropdownMenuItem disabled className="gap-2">
              <Check className="h-3.5 w-3.5 shrink-0 opacity-0" />
              <span className="truncate">No parsers</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            disabled={!hasWriteAccess}
            onSelect={openCreateParser}
          >
            {hasWriteAccess ? (
              <Plus className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Lock className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">Create parser</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ParserStudioPanel
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
          }
        }}
        projectId={projectId}
        draft={draft}
        parserFilterColumns={parserFilterColumns}
        isSaving={isSaving}
        isDeleting={deleteMutation.isPending}
        onDraftChange={setDraft}
        onSave={saveDraft}
        onDelete={draft?.id ? deleteDraft : undefined}
      />
    </div>
  );
}
