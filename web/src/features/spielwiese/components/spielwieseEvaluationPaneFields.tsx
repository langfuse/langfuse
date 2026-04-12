import { type ReactNode } from "react";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { ThresholdComparator } from "./spielwieseEvaluationPaneConfig";

export function ConfigLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-foreground/48 text-[10px] font-semibold tracking-[0.08em] uppercase">
      {children}
    </span>
  );
}

export function ConfigField({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "flex min-w-0 flex-col gap-1.5"}>
      {children}
    </div>
  );
}

export function ConfigCopy({ children }: { children: ReactNode }) {
  return <p className="text-foreground/56 text-[12px] leading-5">{children}</p>;
}

export function ConfigSelect({
  ariaLabel,
  children,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  children: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="border-border/50 bg-background h-8 w-full rounded-[10px] px-2.5 text-[13px] shadow-none focus-visible:ring-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function ThresholdComparatorField({
  ariaLabel,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  value: ThresholdComparator;
  onValueChange: (value: ThresholdComparator) => void;
}) {
  return (
    <ConfigField className="flex w-[9.25rem] min-w-0 flex-col gap-1.5">
      <ConfigLabel>Comparator</ConfigLabel>
      <ConfigSelect
        ariaLabel={ariaLabel}
        value={value}
        onValueChange={(nextValue) =>
          onValueChange(nextValue as ThresholdComparator)
        }
      >
        <SelectItem value="less than">less than</SelectItem>
        <SelectItem value="greater than">greater than</SelectItem>
        <SelectItem value="equal to">equal to</SelectItem>
      </ConfigSelect>
    </ConfigField>
  );
}

function ThresholdValueField({
  ariaLabel,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <ConfigField className="flex w-[7.5rem] min-w-0 flex-col gap-1.5">
      <ConfigLabel>Threshold</ConfigLabel>
      <Input
        aria-label={ariaLabel}
        className="border-border/50 bg-background h-8 rounded-[10px] px-2.5 text-right text-[13px] tabular-nums shadow-none focus-visible:ring-0"
        inputMode="decimal"
        type="number"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </ConfigField>
  );
}

function ThresholdUnitField({
  ariaLabel,
  unitOptions,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  unitOptions: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <ConfigField className="flex w-[7.75rem] min-w-0 flex-col gap-1.5">
      <ConfigLabel>Unit</ConfigLabel>
      <ConfigSelect
        ariaLabel={ariaLabel}
        value={value}
        onValueChange={onValueChange}
      >
        {unitOptions.map((unit) => (
          <SelectItem key={unit} value={unit}>
            {unit}
          </SelectItem>
        ))}
      </ConfigSelect>
    </ConfigField>
  );
}

export function ThresholdConfigInputs({
  comparatorAriaLabel,
  comparatorValue,
  inputAriaLabel,
  inputValue,
  unitAriaLabel,
  unitOptions,
  unitValue,
  onComparatorChange,
  onInputChange,
  onUnitChange,
}: {
  comparatorAriaLabel: string;
  comparatorValue: ThresholdComparator;
  inputAriaLabel: string;
  inputValue: string;
  unitAriaLabel: string;
  unitOptions: readonly string[];
  unitValue: string;
  onComparatorChange: (value: ThresholdComparator) => void;
  onInputChange: (value: string) => void;
  onUnitChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <ThresholdComparatorField
        ariaLabel={comparatorAriaLabel}
        value={comparatorValue}
        onValueChange={onComparatorChange}
      />
      <ThresholdValueField
        ariaLabel={inputAriaLabel}
        value={inputValue}
        onValueChange={onInputChange}
      />
      <ThresholdUnitField
        ariaLabel={unitAriaLabel}
        unitOptions={unitOptions}
        value={unitValue}
        onValueChange={onUnitChange}
      />
    </div>
  );
}
