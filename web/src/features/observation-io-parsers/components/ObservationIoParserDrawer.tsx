import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Braces, Lock, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";

type ObservationIoParserConfig =
  RouterOutputs["observationIoParsers"]["list"][number];

type ParserFieldDraft = {
  id: string;
  source: "input" | "output" | "metadata";
  jsonPath: string;
  display: "auto" | "json" | "markdown";
};

type ParserDraft = {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  filters: FilterState;
  fields: ParserFieldDraft[];
};

const newFieldDraft = (): ParserFieldDraft => ({
  id: `${Date.now()}-${Math.random()}`,
  source: "output",
  jsonPath: "$",
  display: "auto",
});

const createDraft = (
  currentFilters: FilterState,
  priority: number,
): ParserDraft => ({
  name: "",
  description: "",
  enabled: true,
  priority,
  filters: currentFilters,
  fields: [newFieldDraft()],
});

const draftFromConfig = (config: ObservationIoParserConfig): ParserDraft => ({
  id: config.id,
  name: config.name,
  description: config.description ?? "",
  enabled: config.enabled,
  priority: config.priority,
  filters: config.filters,
  fields: config.instructions.fields.map((field) => ({
    source: field.source,
    jsonPath: field.jsonPath,
    display: field.display,
    id: `${field.source}-${field.jsonPath}-${Math.random()}`,
  })),
});

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

const customSelectFilterColumns = [
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
];

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

export function ObservationIoParserDrawer({
  projectId,
  currentFilters = [],
  trigger,
  editConfigId,
  onEditConfigIdChange,
  open,
  onOpenChange,
}: {
  projectId: string;
  currentFilters?: FilterState;
  trigger?: ReactNode | null;
  editConfigId?: string | null;
  onEditConfigIdChange?: (configId: string | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setIsOpen = onOpenChange ?? setUncontrolledOpen;
  const [draft, setDraft] = useState<ParserDraft | null>(null);
  const [dropdownId, setDropdownId] = useState<string | null>(null);
  const draftFiltersRef = useRef<FilterState | null>(null);
  const utils = api.useUtils();

  const configs = api.observationIoParsers.list.useQuery({ projectId });
  const projectPreference =
    api.observationIoParsers.getProjectPreference.useQuery(
      { projectId },
      { enabled: isOpen },
    );
  const userPreference = api.observationIoParsers.getUserPreference.useQuery(
    { projectId },
    { enabled: isOpen },
  );
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
      enabled: isOpen || Boolean(draft),
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

  const projectPreferenceMutation =
    api.observationIoParsers.setProjectPreference.useMutation({
      onSuccess: invalidate,
      onError: (error) =>
        showErrorToast(
          "Failed to update project parser preference",
          error.message,
        ),
    });

  const userPreferenceMutation =
    api.observationIoParsers.setUserPreference.useMutation({
      onSuccess: invalidate,
      onError: (error) =>
        showErrorToast("Failed to update parser preference", error.message),
    });

  const createMutation = api.observationIoParsers.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setDraft(null);
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
  const parserFilterColumns = useMemo(
    () => getParserFilterColumns(filterOptions.data),
    [filterOptions.data],
  );

  const openCreateDialog = () => {
    const nextDraft = createDraft(currentFilters, configsByPriority.length);
    draftFiltersRef.current = nextDraft.filters;
    setDraft(nextDraft);
  };

  const openEditDialog = (config: ObservationIoParserConfig) => {
    const nextDraft = draftFromConfig(config);
    draftFiltersRef.current = nextDraft.filters;
    setDraft(nextDraft);
  };

  useEffect(() => {
    if (!editConfigId) return;

    const config = configs.data?.find(
      (candidate) => candidate.id === editConfigId,
    );
    if (!config) return;

    const nextDraft = draftFromConfig(config);
    draftFiltersRef.current = nextDraft.filters;
    setDraft(nextDraft);
    onEditConfigIdChange?.(null);
  }, [configs.data, editConfigId, onEditConfigIdChange]);

  const saveDraft = () => {
    if (!draft) return;

    const payload = {
      projectId,
      name: draft.name,
      description: draft.description || null,
      enabled: draft.enabled,
      priority: draft.priority,
      filters: draftFiltersRef.current ?? draft.filters,
      instructions: {
        version: 1 as const,
        fields: draft.fields.map(({ id: _id, ...field }) => field),
      },
    };

    if (draft.id) {
      updateMutation.mutate({ ...payload, id: draft.id });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSettingDefault =
    projectPreferenceMutation.isPending || userPreferenceMutation.isPending;

  return (
    <>
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        {trigger !== null ? (
          <DrawerTrigger asChild>
            {trigger ?? (
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Braces className="h-4 w-4" />
                IO Parsers
                <Badge variant="secondary" size="sm">
                  {configs.data?.length ?? 0}
                </Badge>
              </Button>
            )}
          </DrawerTrigger>
        ) : null}
        <DrawerContent size="md">
          <DrawerHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <DrawerTitle>IO Parsers</DrawerTitle>
              <Button
                size="sm"
                className="gap-1"
                onClick={openCreateDialog}
                disabled={!hasWriteAccess}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="divide-border divide-y">
              {configsByPriority.length === 0 ? (
                <div className="text-muted-foreground p-4 text-sm">
                  No parsers
                </div>
              ) : (
                configsByPriority.map((config) => {
                  const isUserDefault =
                    userPreference.data?.enabled !== false &&
                    userPreference.data?.selectedConfigId === config.id;
                  const isProjectDefault =
                    projectPreference.data?.enabled === true &&
                    projectPreference.data?.selectedConfigId === config.id;
                  const canSetDefault = config.enabled || isUserDefault;
                  const canSetProjectDefault =
                    config.enabled || isProjectDefault;

                  return (
                    <div key={config.id} className="grid gap-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {config.name}
                            </span>
                            <Badge
                              variant={config.enabled ? "success" : "secondary"}
                              size="sm"
                            >
                              {config.enabled ? "On" : "Off"}
                            </Badge>
                            {isUserDefault ? (
                              <Badge variant="secondary" size="sm">
                                Your default
                              </Badge>
                            ) : null}
                            {isProjectDefault ? (
                              <Badge variant="outline" size="sm">
                                Project default
                              </Badge>
                            ) : null}
                          </div>
                          {config.description ? (
                            <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                              {config.description}
                            </div>
                          ) : null}
                        </div>
                        <DropdownMenu
                          open={dropdownId === config.id}
                          onOpenChange={(open) =>
                            setDropdownId(open ? config.id : null)
                          }
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="shrink-0"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="flex flex-col *:w-full *:justify-start">
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditDialog(config);
                                setDropdownId(null);
                              }}
                              disabled={!hasWriteAccess}
                            >
                              {hasWriteAccess ? (
                                <Pencil className="mr-2 h-4 w-4" />
                              ) : (
                                <Lock className="mr-2 h-4 w-4" />
                              )}
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                userPreferenceMutation.mutate({
                                  projectId,
                                  enabled: true,
                                  selectedConfigId: isUserDefault
                                    ? null
                                    : config.id,
                                });
                                setDropdownId(null);
                              }}
                              disabled={isSettingDefault || !canSetDefault}
                            >
                              {isUserDefault
                                ? "Remove as my default"
                                : "Set as my default"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                projectPreferenceMutation.mutate({
                                  projectId,
                                  enabled: !isProjectDefault,
                                  selectedConfigId: isProjectDefault
                                    ? null
                                    : config.id,
                                });
                                setDropdownId(null);
                              }}
                              disabled={
                                !hasWriteAccess ||
                                isSettingDefault ||
                                !canSetProjectDefault
                              }
                            >
                              {isProjectDefault
                                ? "Remove as project default"
                                : "Set as project default"}
                              {!hasWriteAccess ? (
                                <Lock className="ml-auto h-4 w-4" />
                              ) : null}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                if (window.confirm(`Delete ${config.name}?`)) {
                                  deleteMutation.mutate({
                                    projectId,
                                    id: config.id,
                                  });
                                }
                                setDropdownId(null);
                              }}
                              disabled={
                                !hasWriteAccess || deleteMutation.isPending
                              }
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                        <span>{config.filters.length} filters</span>
                        <span>{config.instructions.fields.length} fields</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) {
            draftFiltersRef.current = null;
            setDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Edit parser" : "Add parser"}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <DialogBody className="grid max-h-[70vh] gap-4 overflow-y-auto">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_5rem]">
                <label className="grid gap-1">
                  <span className="text-xs font-medium">Name</span>
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </label>
                <div className="flex items-end justify-between gap-2 pb-1">
                  <span className="text-xs font-medium">Enabled</span>
                  <Switch
                    checked={draft.enabled}
                    onCheckedChange={(enabled) =>
                      setDraft({ ...draft, enabled })
                    }
                  />
                </div>
              </div>

              <label className="grid gap-1">
                <span className="text-xs font-medium">Description</span>
                <Input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                />
              </label>

              <div className="grid gap-1">
                <span className="text-xs font-medium">Filters</span>
                <InlineFilterBuilder
                  columnIdentifier="id"
                  columns={parserFilterColumns}
                  filterState={draft.filters}
                  onChange={(filters: FilterState) => {
                    draftFiltersRef.current = filters;
                  }}
                  columnsWithCustomSelect={customSelectFilterColumns}
                />
              </div>

              <Separator />

              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Fields</span>
                  <Button
                    variant="outline"
                    size="xs"
                    className="gap-1"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        fields: [...draft.fields, newFieldDraft()],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Field
                  </Button>
                </div>
                {draft.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid gap-2 rounded-md border p-2"
                  >
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[8rem_1fr_auto]">
                      <Select
                        value={field.source}
                        onValueChange={(source) => {
                          const fields = [...draft.fields];
                          fields[index] = {
                            ...field,
                            source: source as ParserFieldDraft["source"],
                          };
                          setDraft({ ...draft, fields });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="input">input</SelectItem>
                          <SelectItem value="output">output</SelectItem>
                          <SelectItem value="metadata">metadata</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="font-mono text-xs"
                        value={field.jsonPath}
                        placeholder="$.answer"
                        onChange={(event) => {
                          const fields = [...draft.fields];
                          fields[index] = {
                            ...field,
                            jsonPath: event.target.value,
                          };
                          setDraft({ ...draft, fields });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8",
                          draft.fields.length === 1 && "invisible",
                        )}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.filter(
                              (candidate) => candidate.id !== field.id,
                            ),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveDraft} disabled={isSaving || !draft?.name}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
