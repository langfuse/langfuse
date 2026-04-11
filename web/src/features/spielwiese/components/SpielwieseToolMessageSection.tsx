import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

const defaultToolOptions = [
  { label: "nutrition_lookup", value: "nutrition_lookup" },
  { label: "ingredient_search", value: "ingredient_search" },
  { label: "macro_lookup", value: "macro_lookup" },
] as const;

export type SpielwieseToolOption = {
  label: string;
  value: string;
};

const toolExampleSeeds = {
  ingredient_search: {
    back: '{\n  "ingredients": ["eggs", "greek yogurt", "cottage cheese"]\n}',
    sent: '{\n  "query": "high-protein breakfast ingredients"\n}',
  },
  macro_lookup: {
    back: '{\n  "protein_g": 9.5,\n  "carbs_g": 33.2,\n  "fat_g": 16.4\n}',
    sent: '{\n  "foods": ["banana", "peanut butter"]\n}',
  },
  nutrition_lookup: {
    back: '{\n  "kcal": 208,\n  "protein_g": 20.4,\n  "fat_g": 13.4\n}',
    sent: '{\n  "food": "grilled salmon",\n  "weight_g": 175\n}',
  },
} satisfies Record<string, { back: string; sent: string }>;

function getToolExampleSeed(toolValue: string) {
  return (
    toolExampleSeeds[toolValue as keyof typeof toolExampleSeeds] ?? {
      back: "",
      sent: "",
    }
  );
}

type SpielwieseToolMessageSectionProps = {
  nodeId: string;
  onToolChange: (value: string) => void;
  sectionLabel: string;
  toolOptions: SpielwieseToolOption[];
  toolValue: string;
};

type ToolExampleFieldProps = {
  ariaLabel: string;
  name: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

function getResolvedToolOptions(
  toolOptions: SpielwieseToolOption[],
  toolValue: string,
) {
  const availableToolOptions =
    toolOptions.length > 0 ? toolOptions : defaultToolOptions;
  const hasSelectedTool = availableToolOptions.some(
    (option) => option.value === toolValue,
  );

  if (hasSelectedTool || toolValue.trim().length === 0) {
    return availableToolOptions;
  }

  return [...availableToolOptions, { label: toolValue, value: toolValue }];
}

function ToolExampleLabel({
  direction,
  label,
  supportingText,
}: {
  direction: string;
  label: string;
  supportingText: string;
}) {
  return (
    <div className="flex min-h-full flex-col justify-center py-3">
      <div className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
        <span className="shrink-0">{direction}</span>
        <span>{label}</span>
      </div>
      <span className="text-foreground/60 text-[11px] leading-4">
        {supportingText}
      </span>
    </div>
  );
}

function ToolExampleField({
  ariaLabel,
  name,
  onChange,
  placeholder,
  value,
}: ToolExampleFieldProps) {
  return (
    <Textarea
      aria-label={ariaLabel}
      className="text-foreground placeholder:text-foreground/50 min-h-[4.75rem] resize-none border-0 bg-transparent px-0 py-0 font-mono text-[13px] leading-[20px] shadow-none placeholder:italic focus-visible:border-transparent focus-visible:ring-0 max-sm:text-base/6"
      name={name}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      value={value}
    />
  );
}

function ToolPickerSelect({
  items,
  nodeId,
  onValueChange,
  sectionLabel,
  toolValue,
}: {
  items: readonly SpielwieseToolOption[];
  nodeId: string;
  onValueChange: (value: string) => void;
  sectionLabel: string;
  toolValue: string;
}) {
  return (
    <Select
      items={items}
      name={`${nodeId}-${sectionLabel.toLowerCase()}-picker`}
      onValueChange={(value) => {
        if (typeof value !== "string") {
          return;
        }

        onValueChange(value);
      }}
      value={toolValue || null}
    >
      <SelectTrigger
        aria-label={`${nodeId} ${sectionLabel} picker`}
        className="text-foreground data-[popup-open]:bg-background bg-background inline-flex w-fit min-w-[10.5rem] rounded-[10px] px-3 py-2.5 text-sm font-medium shadow-none"
        size="sm"
        variant="inline"
      >
        <SelectValue
          className="data-[placeholder]:text-foreground/55"
          placeholder="Select a tool..."
        />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="bg-background w-max max-w-[11.75rem] min-w-[10.5rem] rounded-[10px] border p-1.5 shadow-lg"
        sideOffset={8}
      >
        <SelectGroup>
          {items.map((option) => (
            <SelectItem
              className="data-[highlighted]:bg-light-yellow/80 data-[highlighted]:text-foreground rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ToolPicker({
  nodeId,
  onToolSelect,
  onToolChange,
  sectionLabel,
  toolOptions,
  toolValue,
}: SpielwieseToolMessageSectionProps & {
  onToolSelect: (value: string) => void;
}) {
  const resolvedToolOptions = getResolvedToolOptions(toolOptions, toolValue);

  return (
    <div className="px-0 py-0">
      <ToolPickerSelect
        items={resolvedToolOptions}
        nodeId={nodeId}
        onValueChange={(value) => {
          onToolChange(value);
          onToolSelect(value);
        }}
        sectionLabel={sectionLabel}
        toolValue={toolValue}
      />
    </div>
  );
}

function ToolResponsePair({
  backValue,
  nodeId,
  onBackChange,
  onSentChange,
  sectionLabel,
  sentValue,
  toolValue,
}: Pick<SpielwieseToolMessageSectionProps, "nodeId" | "sectionLabel"> & {
  backValue: string;
  onBackChange: (value: string) => void;
  onSentChange: (value: string) => void;
  sentValue: string;
  toolValue: string;
}) {
  const placeholderSeed = getToolExampleSeed(toolValue);

  return (
    <div className="bg-background/32 overflow-hidden rounded-[10px] border">
      <div className="divide-y">
        <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3 px-3">
          <div className="border-r pr-3">
            <ToolExampleLabel
              direction="→"
              label="sent"
              supportingText="model -> tool"
            />
          </div>
          <div className="py-3 pr-1">
            <ToolExampleField
              ariaLabel={`${nodeId} ${sectionLabel} sent`}
              name={`${nodeId}-${sectionLabel.toLowerCase()}-sent`}
              onChange={onSentChange}
              placeholder={placeholderSeed.sent}
              value={sentValue}
            />
          </div>
        </div>

        <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3 px-3">
          <div className="border-r pr-3">
            <ToolExampleLabel
              direction="←"
              label="back"
              supportingText="tool -> model"
            />
          </div>
          <div className="py-3 pr-1">
            <ToolExampleField
              ariaLabel={`${nodeId} ${sectionLabel} back`}
              name={`${nodeId}-${sectionLabel.toLowerCase()}-back`}
              onChange={onBackChange}
              placeholder={placeholderSeed.back}
              value={backValue}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SpielwieseToolMessageSection({
  nodeId,
  onToolChange,
  sectionLabel,
  toolOptions,
  toolValue,
}: SpielwieseToolMessageSectionProps) {
  const hasToolSelection = toolValue.trim().length > 0;
  const initialSeed = getToolExampleSeed(toolValue);
  const [sentValue, setSentValue] = useState(initialSeed.sent);
  const [backValue, setBackValue] = useState(initialSeed.back);

  return (
    <div
      className="bg-light-yellow/70 rounded-[10px] px-3 py-3"
      data-testid="spielwiese-tool-message-section"
    >
      <div className="overflow-visible">
        <ToolPicker
          nodeId={nodeId}
          onToolSelect={(value) => {
            const nextSeed = getToolExampleSeed(value);
            setSentValue(nextSeed.sent);
            setBackValue(nextSeed.back);
          }}
          onToolChange={onToolChange}
          sectionLabel={sectionLabel}
          toolOptions={toolOptions}
          toolValue={toolValue}
        />
      </div>
      {hasToolSelection ? (
        <div className="mt-3 border-t pt-3 pl-11">
          <ToolResponsePair
            backValue={backValue}
            nodeId={nodeId}
            onBackChange={setBackValue}
            onSentChange={setSentValue}
            sectionLabel={sectionLabel}
            sentValue={sentValue}
            toolValue={toolValue}
          />
        </div>
      ) : null}
    </div>
  );
}
