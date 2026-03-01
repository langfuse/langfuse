import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { DatePicker } from "@/src/components/date-picker";
import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FilterIcon,
  Info,
  Plus,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  type WipFilterState,
  type WipFilterCondition,
  type FilterState,
  type FilterCondition,
  type ColumnDefinition,
  filterOperators,
  singleFilter,
} from "@langfuse/shared";
import { NonEmptyString } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
} from "@/src/components/ui/input-command";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

/**
 * Extended ColumnDefinition with optional alert for UI display.
 * Alerts are added dynamically in the web layer based on feature availability.
 */
export type ColumnDefinitionWithAlert = ColumnDefinition & {
  alert?: {
    severity: "info" | "warning" | "error";
    content: React.ReactNode;
  };
};

// Has WipFilterState, passes all valid filters to parent onChange
export function PopoverFilterBuilder({
  columns,
  filterState,
  onChange,
  columnIdentifier = "name",
  columnsWithCustomSelect = [],
  filterWithAI = false,
  buttonType = "default",
}: {
  /** Which column field to persist in filter.column: 'id' for stable refs, 'name' for legacy compatibility */
  columns: ColumnDefinitionWithAlert[];
  filterState: FilterState;
  onChange:
    | Dispatch<SetStateAction<FilterState>>
    | ((newState: FilterState) => void);
  columnIdentifier?: ColumnIdentifier;
  columnsWithCustomSelect?: string[];
  filterWithAI?: boolean;
  buttonType?: "default" | "icon";
}) {
  const capture = usePostHogClientCapture();
  const [wipFilterState, _setWipFilterState] =
    useState<WipFilterState>(filterState);

  // Sync wipFilterState when filterState prop changes externally
  // (e.g., when a saved view preset is applied)
  // We use a ref to track previous filterState to avoid re-running when wipFilterState changes
  const prevFilterStateRef = useRef(filterState);
  useEffect(() => {
    // Only sync if filterState actually changed (reference comparison is fine here
    // since filterState comes from URL parsing which creates new arrays)
    if (prevFilterStateRef.current === filterState) return;
    prevFilterStateRef.current = filterState;

    _setWipFilterState((currentWip) => {
      const hasWipFilters = currentWip.some(
        (f) => !singleFilter.safeParse(f).success,
      );
      // Don't sync if user is actively editing (has invalid WIP filters)
      return hasWipFilters ? currentWip : filterState;
    });
  }, [filterState]);

  const addNewFilter = () => {
    setWipFilterState((prev) => [
      ...prev,
      {
        column: undefined,
        type: undefined,
        operator: undefined,
        value: undefined,
        key: undefined,
      },
    ]);
  };

  const getValidFilters = (state: WipFilterState): FilterCondition[] => {
    const valid = state.filter(
      (f) => singleFilter.safeParse(f).success,
    ) as FilterCondition[];
    return valid;
  };

  const setWipFilterState = (
    state: ((prev: WipFilterState) => WipFilterState) | WipFilterState,
  ) => {
    _setWipFilterState((prev) => {
      const newState = state instanceof Function ? state(prev) : state;
      const validFilters = getValidFilters(newState);
      onChange(validFilters);
      return newState;
    });
  };

  return (
    <div className="flex items-center">
      <Popover
        onOpenChange={(open) => {
          if (open) {
            capture("table:filter_builder_open");
          }
          // Create empty filter when opening popover
          if (open && filterState.length === 0) addNewFilter();
          // Discard all wip filters when closing popover
          if (!open) {
            capture("table:filter_builder_close", {
              filter: filterState,
            });
            setWipFilterState(filterState);
          }
        }}
      >
        <PopoverTrigger asChild>
          {buttonType === "default" ? (
            <Button variant="outline" type="button">
              <span>Filters</span>
              {filterState.length > 0 && filterState.length < 3 ? (
                <InlineFilterState
                  filterState={filterState}
                  className="hidden @6xl:block"
                />
              ) : null}
              {filterState.length > 0 ? (
                <span
                  className={cn(
                    "ml-1.5 rounded-sm bg-input px-1 text-xs shadow-sm @6xl:hidden",
                    filterState.length > 2 && "@6xl:inline",
                  )}
                >
                  {filterState.length}
                </span>
              ) : (
                <ChevronDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          ) : (
            <Button
              size="icon"
              type="button"
              variant="ghost"
              className="relative"
            >
              <FilterIcon className="h-4 w-4" />
              {filterState.length > 0 && (
                <span
                  className={cn(
                    "absolute -right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-sm bg-input px-1 text-xs shadow-sm",
                  )}
                >
                  {filterState.length}
                </span>
              )}
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          className="w-fit max-w-[90vw] overflow-x-auto"
          align="start"
        >
          <FilterBuilderForm
            columnIdentifier={columnIdentifier}
            columns={columns}
            filterState={wipFilterState}
            onChange={setWipFilterState}
            columnsWithCustomSelect={columnsWithCustomSelect}
            filterWithAI={filterWithAI}
          />
        </PopoverContent>
      </Popover>
      {filterState.length > 0 ? (
        buttonType === "default" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setWipFilterState([])}
                variant="ghost"
                type="button"
                size="icon"
                className="ml-0.5"
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear all filters</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setWipFilterState([])}
                variant="ghost"
                type="button"
                size="icon-xs"
                className="ml-0.5 hover:bg-background"
              >
                <X className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear all filters</TooltipContent>
          </Tooltip>
        )
      ) : null}
    </div>
  );
}

export function InlineFilterState({
  filterState,
  className,
}: {
  filterState: FilterState;
  className?: string;
}) {
  return filterState.map((filter, i) => {
    return (
      <span
        key={i}
        className={cn(
          "ml-2 whitespace-nowrap rounded-md bg-input px-2 py-1 text-xs",
          className,
        )}
      >
        {filter.column}
        {filter.type === "stringObject" || filter.type === "numberObject"
          ? `.${filter.key}`
          : ""}{" "}
        {filter.operator}{" "}
        {filter.type === "positionInTrace"
          ? (() => {
              const mode = filter.key ?? "last";
              const label =
                mode === "root"
                  ? "root"
                  : mode === "last"
                    ? "last"
                    : mode === "nthFromStart"
                      ? `nth from start ${filter.value ?? ""}`.trim()
                      : `nth from end ${filter.value ?? ""}`.trim();
              return label;
            })()
          : filter.type === "datetime"
            ? new Date(filter.value).toLocaleString()
            : filter.type === "stringOptions" || filter.type === "arrayOptions"
              ? filter.value.length > 2
                ? `${filter.value.length} selected`
                : filter.value.join(", ")
              : filter.type === "number" || filter.type === "numberObject"
                ? filter.value
                : filter.type === "boolean"
                  ? `${filter.value}`
                  : filter.type === "null"
                    ? ""
                    : `"${filter.value}"`}
      </span>
    );
  });
}

type ColumnIdentifier = "id" | "name";

export function InlineFilterBuilder({
  columns,
  filterState,
  onChange,
  columnIdentifier = "name",
  disabled,
  columnsWithCustomSelect,
  filterWithAI = false,
}: {
  columns: ColumnDefinitionWithAlert[];
  filterState: FilterState;
  onChange:
    | Dispatch<SetStateAction<FilterState>>
    | ((newState: FilterState) => void);
  /** Which column field to persist in filter.column: 'id' for stable refs, 'name' for legacy compatibility */
  columnIdentifier?: ColumnIdentifier;
  disabled?: boolean;
  columnsWithCustomSelect?: string[];
  filterWithAI?: boolean;
}) {
  const [wipFilterState, _setWipFilterState] =
    useState<WipFilterState>(filterState);

  // sync filter state, e.g. when we exclude default LF filters on score creation to reflect in UI
  // Only sync if we don't have any WIP (invalid) filters, to avoid overwriting user's work-in-progress
  useEffect(() => {
    const hasWipFilters = wipFilterState.some(
      (f) => !singleFilter.safeParse(f).success,
    );

    // Don't sync if we have WIP filters - user is actively editing
    if (!hasWipFilters) {
      _setWipFilterState(filterState);
    }
  }, [filterState, wipFilterState]);

  const setWipFilterState = (
    state: ((prev: WipFilterState) => WipFilterState) | WipFilterState,
  ) => {
    _setWipFilterState((prev) => {
      const newState = state instanceof Function ? state(prev) : state;
      const validFilters = newState.filter(
        (f) => singleFilter.safeParse(f).success,
      ) as FilterState;
      onChange(validFilters);
      return newState;
    });
  };

  return (
    <div className="flex flex-col">
      <FilterBuilderForm
        columnIdentifier={columnIdentifier}
        columns={columns}
        filterState={wipFilterState}
        onChange={setWipFilterState}
        disabled={disabled}
        columnsWithCustomSelect={columnsWithCustomSelect}
        filterWithAI={filterWithAI}
      />
    </div>
  );
}

const getOperator = (
  type: NonNullable<WipFilterCondition["type"]>,
): WipFilterCondition["operator"] => {
  return filterOperators[type]?.length > 0
    ? filterOperators[type][0]
    : undefined;
};

/**
 * Returns severity-based styling classes for alert icons and tooltips
 */
const getAlertStyles = (severity: "info" | "warning" | "error") => {
  const styles = {
    error: {
      iconColor: "text-red-600",
      tooltipBg: "bg-red-50 dark:bg-red-950",
    },
    info: {
      iconColor: "text-blue-600",
      tooltipBg: "bg-blue-50 dark:bg-blue-950",
    },
    warning: {
      iconColor: "text-amber-600",
      tooltipBg: "bg-amber-50 dark:bg-amber-950",
    },
  };

  return styles[severity];
};

function FilterBuilderForm({
  columnIdentifier,
  columns,
  filterState,
  onChange,
  disabled,
  columnsWithCustomSelect = [],
  filterWithAI = false,
}: {
  columnIdentifier: ColumnIdentifier;
  columns: ColumnDefinitionWithAlert[];
  filterState: WipFilterState;
  onChange: Dispatch<SetStateAction<WipFilterState>>;
  disabled?: boolean;
  columnsWithCustomSelect?: string[];
  filterWithAI?: boolean;
}) {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const [showAiFilter, setShowAiFilter] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const projectId = useProjectIdFromURL();
  const { organization } = useQueryProject();

  const createFilterMutation =
    api.naturalLanguageFilters.createCompletion.useMutation();
  const handleFilterChange = (filter: WipFilterCondition, i: number) => {
    onChange((prev) => {
      const newState = [...prev];
      newState[i] = filter;
      return newState;
    });
  };

  const addNewFilter = () => {
    onChange((prev) => [
      ...prev,
      {
        column: undefined,
        operator: undefined,
        value: undefined,
        type: undefined,
        key: undefined,
      },
    ]);
  };

  const removeFilter = (i: number) => {
    onChange((prev) => {
      const newState = [...prev];
      newState.splice(i, 1);
      return newState;
    });
  };

  const handleAiFilterSubmit = async () => {
    if (aiPrompt.trim() && !createFilterMutation.isPending && projectId) {
      setAiError(null);
      try {
        const result = await createFilterMutation.mutateAsync({
          projectId,
          prompt: aiPrompt.trim(),
        });

        if (result && Array.isArray(result.filters)) {
          if (result.filters.length === 0) {
            setAiError("Failed to generate filters, try again");
            return;
          }

          // Set the filters from the API response
          onChange(result.filters as WipFilterState);
          setAiPrompt("");
          setShowAiFilter(false);
        } else {
          console.error(result);
          setAiError("Invalid response format from API");
        }
      } catch (error) {
        console.error("Error calling tRPC API:", error);
        setAiError(
          error instanceof Error ? error.message : "Failed to generate filters",
        );
      }
    }
  };

  return (
    <>
      {/* AI Filter Section at the top */}
      {!disabled && isLangfuseCloud && filterWithAI && (
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              if (!organization?.aiFeaturesEnabled && organization?.id) {
                window.open(
                  `/organization/${organization.id}/settings`,
                  "_blank",
                );
              } else {
                setShowAiFilter(!showAiFilter);
              }
            }}
            type="button"
            variant="outline"
            size="default"
            disabled={false}
            title={
              !organization?.aiFeaturesEnabled
                ? "AI features are disabled for your organization. Click to enable them in organization settings."
                : undefined
            }
            className="w-full justify-start text-muted-foreground"
          >
            <WandSparkles className="mr-2 h-4 w-4" />
            {!organization?.aiFeaturesEnabled ? (
              <>
                AI Filters: Enable in Organization Settings (Admin Only)
                <ExternalLink className="ml-2 h-4 w-4" />
              </>
            ) : showAiFilter ? (
              "Cancel"
            ) : (
              "Create Filter with AI"
            )}
          </Button>
          {showAiFilter && (
            <div className="flex flex-col gap-3">
              <Textarea
                value={aiPrompt}
                onChange={(e) => {
                  setAiPrompt(e.target.value);
                  if (aiError) setAiError(null); // Clear error when user starts typing
                }}
                placeholder="Describe the filters you want to apply..."
                className="min-h-[80px] min-w-[28rem] resize-none"
                disabled={createFilterMutation.isPending}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    e.ctrlKey &&
                    !createFilterMutation.isPending
                  ) {
                    handleAiFilterSubmit();
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAiFilterSubmit}
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={createFilterMutation.isPending || !aiPrompt.trim()}
                >
                  {createFilterMutation.isPending
                    ? "Loading..."
                    : "Generate filters"}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      We convert natural language into deterministic filters
                      which you can adjust afterwards
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {aiError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {aiError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hide filter builder UI while AI filter is open */}
      {!showAiFilter && (
        <>
          <table className="table-auto">
            <tbody>
              {filterState.map((filter, i) => {
                const column = columns.find(
                  (c) => c.id === filter.column || c.name === filter.column,
                );
                return (
                  <tr key={i}>
                    <td className="p-1 text-sm">{i === 0 ? "Where" : "And"}</td>
                    <td className="flex gap-2 p-1">
                      {/* selector of the column to be filtered */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            type="button"
                            disabled={disabled}
                            className="flex w-full min-w-32 items-center justify-between gap-2"
                          >
                            <span className="truncate">
                              {column ? column.name : "Column"}
                            </span>
                            <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="max-w-fit p-0"
                          onWheel={(e) => {
                            e.stopPropagation();
                          }}
                          onTouchMove={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <InputCommand>
                            <InputCommandInput
                              placeholder="Search for column"
                              variant="bottom"
                            />
                            <InputCommandList>
                              <InputCommandEmpty>
                                No options found.
                              </InputCommandEmpty>
                              <InputCommandGroup>
                                {columns.map((option) => {
                                  const hasAlert = !!option.alert;
                                  const severity =
                                    option.alert?.severity ?? "warning";
                                  const alertStyles = getAlertStyles(severity);

                                  return (
                                    <InputCommandItem
                                      key={option.id}
                                      value={option.id}
                                      onSelect={(value) => {
                                        const col = columns.find(
                                          (c) => c.id === value,
                                        );
                                        const defaultOperator = col?.type
                                          ? getOperator(col.type)
                                          : undefined;

                                        handleFilterChange(
                                          {
                                            column: col?.[columnIdentifier],
                                            type: col?.type,
                                            operator: defaultOperator,
                                            value:
                                              col?.type === "null"
                                                ? ""
                                                : undefined,
                                            key:
                                              col?.type === "positionInTrace"
                                                ? "last"
                                                : undefined,
                                          } as WipFilterCondition,
                                          i,
                                        );
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          option.id === column?.id
                                            ? "visible"
                                            : "invisible",
                                        )}
                                      />
                                      <span className="flex-1">
                                        {option.name}
                                      </span>
                                      {hasAlert && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Info
                                              className={cn(
                                                "ml-2 h-4 w-4",
                                                alertStyles.iconColor,
                                              )}
                                            />
                                          </TooltipTrigger>
                                          <TooltipContent
                                            className={cn(
                                              "max-w-xs",
                                              alertStyles.tooltipBg,
                                            )}
                                          >
                                            {option.alert?.content}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </InputCommandItem>
                                  );
                                })}
                              </InputCommandGroup>
                            </InputCommandList>
                          </InputCommand>
                        </PopoverContent>
                      </Popover>
                      {filter.type &&
                      (filter.type === "numberObject" ||
                        filter.type === "stringObject") &&
                      (column?.type === "numberObject" ||
                        column?.type === "stringObject") ? (
                        column.keyOptions ? (
                          // Case 1: object with keyOptions - selector of the key of the object
                          <Select
                            disabled={!filter.column}
                            onValueChange={(value) => {
                              handleFilterChange({ ...filter, key: value }, i);
                            }}
                            value={filter.key ?? ""}
                          >
                            <SelectTrigger className="min-w-[60px]">
                              <SelectValue placeholder="" />
                            </SelectTrigger>
                            <SelectContent>
                              {column.keyOptions
                                .filter(
                                  (o) => NonEmptyString.safeParse(o).success,
                                )
                                .map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          // Case 2: object without keyOptions - text input
                          <Input
                            value={filter.key ?? ""}
                            placeholder="key"
                            disabled={disabled}
                            onChange={(e) =>
                              handleFilterChange(
                                { ...filter, key: e.target.value },
                                i,
                              )
                            }
                          />
                        )
                      ) : filter.type === "categoryOptions" &&
                        column?.type === "categoryOptions" ? (
                        // Case 3: categoryOptions
                        <Select
                          onValueChange={(value) => {
                            handleFilterChange({ ...filter, key: value }, i);
                          }}
                          value={filter.key ?? ""}
                        >
                          <SelectTrigger className="min-w-[60px]">
                            <SelectValue placeholder="" />
                          </SelectTrigger>
                          <SelectContent>
                            {column?.options.map((option) => (
                              <SelectItem
                                key={option.label}
                                value={option.label}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : filter.type === "positionInTrace" ? (
                        <Select
                          onValueChange={(value) => {
                            const needsValue =
                              value === "nthFromEnd" ||
                              value === "nthFromStart";
                            handleFilterChange(
                              {
                                ...filter,
                                key: value,
                                value: needsValue
                                  ? typeof filter.value === "number" &&
                                    filter.value >= 1
                                    ? filter.value
                                    : 1
                                  : undefined,
                              } as WipFilterCondition,
                              i,
                            );
                          }}
                          value={filter.key ?? "last"}
                        >
                          <SelectTrigger className="min-w-[140px]">
                            <SelectValue placeholder="" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="root">1st</SelectItem>
                            <SelectItem value="last">last</SelectItem>
                            <SelectItem value="nthFromStart">
                              nth from start
                            </SelectItem>
                            <SelectItem value="nthFromEnd">
                              nth from end
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : null}
                    </td>
                    <td className="p-1">
                      <Select
                        disabled={!filter.column || disabled}
                        onValueChange={(value) => {
                          // protect against invalid empty operator values
                          if (value === "") return;
                          handleFilterChange(
                            {
                              ...filter,
                              operator: value as any,
                              // Ensure null filters always have empty string value
                              value:
                                filter.type === "null"
                                  ? ""
                                  : (filter.value as any),
                            },
                            i,
                          );
                        }}
                        value={filter.operator ?? ""}
                      >
                        <SelectTrigger className="min-w-[60px]">
                          <SelectValue placeholder="" />
                        </SelectTrigger>
                        <SelectContent>
                          {filter.type !== undefined
                            ? filterOperators[filter.type].map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))
                            : null}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      {filter.type === "string" ||
                      filter.type === "stringObject" ? (
                        <Input
                          disabled={disabled}
                          value={filter.value ?? ""}
                          placeholder="string"
                          onChange={(e) =>
                            handleFilterChange(
                              { ...filter, value: e.target.value },
                              i,
                            )
                          }
                        />
                      ) : filter.type === "number" ||
                        filter.type === "numberObject" ? (
                        <Input
                          value={filter.value ?? undefined}
                          disabled={disabled}
                          type="number"
                          step="0.01"
                          lang="en-US"
                          onChange={(e) =>
                            handleFilterChange(
                              {
                                ...filter,
                                value: isNaN(Number(e.target.value))
                                  ? e.target.value
                                  : Number(e.target.value),
                              },
                              i,
                            )
                          }
                        />
                      ) : filter.type === "datetime" ? (
                        <DatePicker
                          className="w-full"
                          disabled={disabled}
                          date={
                            filter.value ? new Date(filter.value) : undefined
                          }
                          onChange={(date) => {
                            handleFilterChange(
                              {
                                ...filter,
                                value: date,
                              },
                              i,
                            );
                          }}
                          includeTimePicker
                        />
                      ) : filter.type === "stringOptions" ||
                        filter.type === "arrayOptions" ? (
                        <MultiSelect
                          title="Value"
                          className="min-w-[100px]"
                          options={
                            column?.type === filter.type ? column.options : []
                          }
                          onValueChange={(value) =>
                            handleFilterChange({ ...filter, value }, i)
                          }
                          values={
                            Array.isArray(filter.value) ? filter.value : []
                          }
                          disabled={disabled}
                          isCustomSelectEnabled={
                            column?.type === filter.type &&
                            columnsWithCustomSelect.includes(column.id)
                          }
                        />
                      ) : filter.type === "categoryOptions" &&
                        column?.type === "categoryOptions" ? (
                        <MultiSelect
                          title="Value"
                          className="min-w-[100px]"
                          options={
                            column?.options
                              .find((o) => o.label === filter.key)
                              ?.values?.map((v) => ({ value: v })) ?? []
                          }
                          onValueChange={(value) =>
                            handleFilterChange({ ...filter, value }, i)
                          }
                          values={
                            Array.isArray(filter.value) ? filter.value : []
                          }
                          disabled={disabled}
                          isCustomSelectEnabled={
                            column?.type === filter.type &&
                            columnsWithCustomSelect.includes(column.id)
                          }
                        />
                      ) : filter.type === "boolean" ? (
                        <Select
                          disabled={disabled}
                          onValueChange={(value) => {
                            handleFilterChange(
                              {
                                ...filter,
                                value:
                                  value !== "" ? value === "true" : undefined,
                              },
                              i,
                            );
                          }}
                          value={filter.value?.toString() ?? ""}
                        >
                          <SelectTrigger className="min-w-[60px]">
                            <SelectValue placeholder="" />
                          </SelectTrigger>
                          <SelectContent>
                            {["true", "false"].map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : filter.type === "positionInTrace" ? (
                        filter.key === "nthFromStart" ||
                        filter.key === "nthFromEnd" ? (
                          <Input
                            value={filter.value ?? ""}
                            disabled={disabled}
                            type="number"
                            min={1}
                            step={1}
                            onChange={(e) =>
                              handleFilterChange(
                                {
                                  ...filter,
                                  value: isNaN(Number(e.target.value))
                                    ? undefined
                                    : Math.max(1, Number(e.target.value)),
                                } as WipFilterCondition,
                                i,
                              )
                            }
                          />
                        ) : (
                          <Input disabled placeholder="-" />
                        )
                      ) : filter.type === "null" ? null : (
                        <Input disabled />
                      )}
                    </td>
                    <td>
                      <Button
                        onClick={() => removeFilter(i)}
                        variant="ghost"
                        type="button"
                        disabled={disabled}
                        size="xs"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!disabled ? (
            <Button
              onClick={() => addNewFilter()}
              type="button" // required as it will otherwise submit forms where this component is used
              className="mt-2"
              variant="outline"
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add filter
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
