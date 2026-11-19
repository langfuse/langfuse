import { useState, type ReactNode } from "react";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type TextFilterEntry } from "@/src/features/filters/hooks/useSidebarFilterState";

import { CategoricalFilterSelect } from "@/src/features/filters/components/CategoricalFilterSelect";

export interface CategoricalFilterContentProps {
  filterKey: string;
  tableName: string | undefined;
  loading?: boolean;
  mode: "select" | "text";
  onModeChange: (mode: "select" | "text") => void;
  options: string[];
  counts: Map<string, number>;
  displayByValue?: Map<string, string>;
  value: string[];
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  renderIcon?: (value: string) => ReactNode;
  renderOptionSuffix?: (value: string) => ReactNode;
  getOptionTitle?: (value: string, displayLabel: string) => string;
  operator?: "any of" | "all of" | "none of";
  onOperatorChange?: (operator: "any of" | "all of" | "none of") => void;
  textFilters?: TextFilterEntry[];
  onTextFilterAdd?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
  onTextFilterRemove?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
}

export function CategoricalFilterContent({
  filterKey,
  tableName,
  loading,
  mode,
  onModeChange,
  options,
  counts,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
  renderOptionSuffix,
  getOptionTitle,
  operator,
  onOperatorChange,
  textFilters,
  onTextFilterAdd,
  onTextFilterRemove,
}: CategoricalFilterContentProps) {
  return (
    <div className="flex flex-col">
      {onTextFilterAdd && (
        <div className="mt-1 mb-2 px-3">
          <FilterModeTabs mode={mode} onModeChange={onModeChange} />
        </div>
      )}
      {mode === "select" && (
        <CategoricalFilterSelect
          filterKey={filterKey}
          tableName={tableName ?? "data"}
          loading={loading}
          options={options}
          counts={counts}
          displayByValue={displayByValue}
          value={value}
          onChange={onChange}
          onOnlyChange={onOnlyChange}
          renderIcon={renderIcon}
          renderOptionSuffix={renderOptionSuffix}
          getOptionTitle={getOptionTitle}
          operator={operator}
          onOperatorChange={onOperatorChange}
        />
      )}
      {mode === "text" && onTextFilterAdd && (
        <div className="py-1">
          <TextFilterSection
            allFilters={textFilters ?? []}
            onAdd={onTextFilterAdd}
            onRemove={onTextFilterRemove}
          />
        </div>
      )}
    </div>
  );
}

// Filter mode tabs for switching between Select (checkboxes) and Text (contains) modes
interface FilterModeTabsProps {
  mode: "select" | "text";
  onModeChange: (mode: "select" | "text") => void;
}

function FilterModeTabs({ mode, onModeChange }: FilterModeTabsProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(newMode) => onModeChange(newMode as "select" | "text")}
    >
      <Tabs.List variant="inset" layout="full" size="sm">
        <Tabs.Trigger value="select" label="Select" />
        <Tabs.Trigger value="text" label="Text" />
      </Tabs.List>
    </Tabs>
  );
}

// Text filter section for categorical filters
// Single input with DOES/DOES NOT toggle, allows adding multiple filters
function TextFilterSection({
  allFilters,
  onAdd,
  onRemove,
}: {
  allFilters: TextFilterEntry[];
  onAdd?: (op: "contains" | "does not contain", val: string) => void;
  onRemove?: (op: "contains" | "does not contain", val: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<
    "contains" | "does not contain"
  >("contains");

  const handleAdd = () => {
    // people have filtered for a single " ", e.g. does not contain " " on sessionID to get all traces with a session id
    if (inputValue.length > 0 && onAdd) {
      onAdd(selectedOperator, inputValue);
      setInputValue("");
    }
  };

  return (
    <div className="space-y-2">
      {/* Operator picker */}
      <div className="px-3">
        <Select
          value={selectedOperator}
          onValueChange={(operator) =>
            setSelectedOperator(operator as "contains" | "does not contain")
          }
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains" className="text-xs">
              contains
            </SelectItem>
            <SelectItem value="does not contain" className="text-xs">
              does not contain
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Input + Add button */}
      <div className="flex items-center gap-2 px-3">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Enter value..."
          className="h-7 flex-1 text-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAdd}
          disabled={inputValue.length === 0}
          className="h-7 shrink-0 px-2 text-xs"
        >
          Add
        </Button>
      </div>

      {/* Active filters list */}
      {allFilters.length > 0 && (
        <div className="space-y-1 px-3">
          {allFilters.map((f, idx) => (
            <div
              key={idx}
              className="group/textfilter border-border/40 bg-muted/30 flex items-center gap-2 rounded border px-2 py-1 text-xs"
            >
              <span className="text-muted-foreground shrink-0 text-[11px] font-bold">
                {f.operator === "contains" ? "contains" : "does not contain"}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-bold"
                title={f.value}
              >
                {f.value}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove?.(f.operator, f.value)}
                className="text-muted-foreground hover:text-foreground h-4 w-4 shrink-0 p-0 opacity-0 transition-opacity group-hover/textfilter:opacity-100"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
