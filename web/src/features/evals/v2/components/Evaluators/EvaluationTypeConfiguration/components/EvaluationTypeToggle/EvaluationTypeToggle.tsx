import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { getEvaluatorMethodIcon } from "@/src/features/evals/v2/fns/templateGallery/evaluatorMethodPresentation";
import { useResizeObserver } from "@/src/hooks/useResizeObserver";

const evaluationTypes = [
  {
    value: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    label: "LLM-as-a-judge",
    icon: getEvaluatorMethodIcon(EvalTemplateTypeEnum.LLM_AS_JUDGE),
    tooltip:
      "When the check needs judgment, such as rating helpfulness, tone, or answer quality.",
  },
  {
    value: EvalTemplateTypeEnum.CODE,
    label: "Code evaluator",
    icon: getEvaluatorMethodIcon(EvalTemplateTypeEnum.CODE),
    tooltip:
      "For deterministic checks like exact matches, regex, or schema validation.",
  },
  {
    value: EvalTemplateTypeEnum.DECISION_MODEL,
    label: "Decision model",
    icon: getEvaluatorMethodIcon(EvalTemplateTypeEnum.DECISION_MODEL),
    tooltip:
      "For a fast, cheap label with calibrated probabilities when the possible answers are known upfront.",
  },
] as const;

/** Selects the evaluator implementation: tabs when they fit the width it is given, a dropdown otherwise. */
export function EvaluationTypeToggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: EvalTemplateType;
  onValueChange: (value: EvalTemplateType) => void;
  disabled?: boolean;
}) {
  const selectedType =
    evaluationTypes.find((type) => type.value === value) ?? evaluationTypes[0];
  const visibleTypes = disabled
    ? evaluationTypes.filter((type) => type.value === value)
    : evaluationTypes;
  const visibleTypesKey = visibleTypes.map((type) => type.value).join();
  const SelectedIcon = selectedType.icon;

  const slotRef = useRef<HTMLDivElement>(null);
  const tabsMeasureRef = useRef<HTMLDivElement>(null);
  const [tabsFit, setTabsFit] = useState(true);

  const measure = useCallback(() => {
    const slot = slotRef.current;
    const tabsMeasure = tabsMeasureRef.current;
    if (!slot || !tabsMeasure) return;

    setTabsFit(
      tabsMeasure.getBoundingClientRect().width <=
        slot.getBoundingClientRect().width,
    );
  }, []);
  // The first check runs before paint, so a slot too narrow never shows the tabs.
  useLayoutEffect(measure, [measure, visibleTypesKey]);
  useResizeObserver(slotRef, measure);
  // The tabs' own width changes without the slot resizing, e.g. when a font loads.
  useResizeObserver(tabsMeasureRef, measure);

  const tabs = (
    <Tabs
      value={value}
      onValueChange={(mode) => onValueChange(mode as EvalTemplateType)}
    >
      <Tabs.List variant="inset" size="md">
        {visibleTypes.map(({ value: typeValue, label, icon, tooltip }) => (
          <Tabs.Trigger
            key={typeValue}
            value={typeValue}
            disabled={disabled}
            icon={icon}
            label={label}
            tooltip={tooltip}
          />
        ))}
      </Tabs.List>
    </Tabs>
  );

  return (
    <div ref={slotRef} className="flex min-w-0 flex-1">
      {/* An unseen copy of the tabs stays mounted to read their natural width. */}
      <div
        aria-hidden="true"
        inert
        className="invisible size-0 overflow-hidden"
      >
        <div ref={tabsMeasureRef} className="w-max">
          {tabs}
        </div>
      </div>
      {tabsFit ? (
        tabs
      ) : (
        <div className="w-52 max-w-full">
          <Select
            value={value}
            onValueChange={(mode) => onValueChange(mode as EvalTemplateType)}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Evaluation type">
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  <SelectedIcon size="base" />
                  <span className="truncate" title={selectedType.label}>
                    {selectedType.label}
                  </span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {visibleTypes.map(({ value: typeValue, label, icon: Icon }) => (
                <SelectItem key={typeValue} value={typeValue}>
                  <span className="flex items-center gap-2">
                    <Icon size="base" />
                    {label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
