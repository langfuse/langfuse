import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  type availableDatasetEvalVariables,
  type availableTraceEvalVariables,
  type EvalTemplate,
  observationEvalVariableColumns,
} from "@langfuse/shared";
import { Card } from "@/src/components/ui/card";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import DocPopup from "@/src/components/layouts/doc-popup";
import { cn } from "@/src/utils/tailwind";
import {
  type EvalFormType,
  fieldHasJsonSelectorOption,
} from "@/src/features/evals/utils/evaluator-form-utils";
import { EvalTargetObject } from "@langfuse/shared";
import { VariableMappingDescription } from "@/src/features/evals/components/eval-form-descriptions";
import {
  EvaluationPromptPreview,
  getVariableColor,
} from "@/src/features/evals/components/evaluation-prompt-preview";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  isEventTarget,
  isLegacyEvalTarget,
  isTraceTarget,
  isTraceOrDatasetObject,
  isTraceOrEventTarget,
} from "@/src/features/evals/utils/typeHelpers";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useEvalConfigMappingData } from "@/src/features/evals/hooks/useEvalConfigMappingData";
import { useEffect, useState } from "react";

export const VariableMappingCard = ({
  projectId,
  availableVariables,
  evalTemplate,
  form,
  oldConfigId,
  disabled = false,
  shouldWrapVariables = false,
  hideAdvancedSettings = false,
}: {
  projectId: string;
  availableVariables:
    | typeof availableTraceEvalVariables
    | typeof availableDatasetEvalVariables;
  evalTemplate: EvalTemplate;
  form: UseFormReturn<EvalFormType>;
  oldConfigId?: string;
  disabled?: boolean;
  shouldWrapVariables?: boolean;
  hideAdvancedSettings?: boolean;
}) => {
  const [showPreview, setShowPreview] = useState(false);

  const { fields } = useFieldArray({
    control: form.control,
    name: "mapping",
  });

  const { namesByObject, isLoading, previewData } = useEvalConfigMappingData(
    projectId,
    form,
    disabled,
  );

  useEffect(() => {
    if (isTraceOrEventTarget(form.getValues("target")) && !disabled) {
      setShowPreview(true);
    } else {
      // For dataset and experiment targets, disable preview
      setShowPreview(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("target"), disabled]);

  const mappingControlButtons = (
    <div className="flex items-center gap-2">
      {isTraceOrEventTarget(form.watch("target")) && !disabled && (
        <>
          <span className="text-xs text-muted-foreground">Preview</span>
          <Switch
            checked={showPreview}
            onCheckedChange={setShowPreview}
            disabled={disabled}
          />
          {showPreview &&
            (previewData ? (
              <DetailPageNav
                currentId={
                  previewData.type === EvalTargetObject.EVENT
                    ? previewData.observationId
                    : previewData.traceId
                }
                listKey={
                  isEventTarget(form.watch("target"))
                    ? "observations"
                    : "traces"
                }
                path={(entry) => {
                  const isEvent = isEventTarget(form.watch("target"));
                  const basePath = hideAdvancedSettings
                    ? `/project/${projectId}/evals/remap?evaluator=${oldConfigId}`
                    : `/project/${projectId}/evals/new?evaluator=${evalTemplate.id}`;
                  if (isEvent) {
                    // For observations/events: entry.id is observationId, entry.params.traceId is traceId
                    return `${basePath}&traceId=${entry.params?.traceId}&observationId=${entry.id}`;
                  } else {
                    // For traces: entry.id is traceId
                    return `${basePath}&traceId=${entry.id}`;
                  }
                }}
              />
            ) : (
              <div className="flex flex-row gap-1">
                <Skeleton className="h-8 w-[54px]" />
                <Skeleton className="h-8 w-[54px]" />
              </div>
            ))}
        </>
      )}
    </div>
  );

  return (
    <Card className="min-w-0 max-w-full p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-lg font-medium">Variable mapping</span>
      </div>
      {isTraceTarget(form.watch("target")) && !disabled && (
        <FormDescription>
          Preview of the evaluation prompt with the variables replaced with the
          first matched trace data subject to the filters.
        </FormDescription>
      )}
      <div className="flex max-w-full flex-col gap-4">
        <FormField
          control={form.control}
          name="mapping"
          render={() => (
            <>
              <div
                className={cn(
                  "my-2 flex max-w-full flex-col gap-2",
                  !shouldWrapVariables && "lg:flex-row",
                )}
              >
                {showPreview ? (
                  previewData ? (
                    <EvaluationPromptPreview
                      projectId={projectId}
                      previewData={previewData}
                      evalTemplate={evalTemplate}
                      variableMapping={form.watch("mapping")}
                      isLoading={isLoading}
                      className={cn(
                        "min-h-48 bg-muted/50",
                        !shouldWrapVariables && "lg:w-2/3",
                      )}
                      controlButtons={mappingControlButtons}
                    />
                  ) : (
                    <div className="flex max-h-full min-h-48 w-full flex-col gap-1 bg-muted/50 lg:w-2/3">
                      <div className="flex flex-row items-center justify-between py-0 text-sm font-medium capitalize">
                        <div className="flex flex-row items-center gap-2">
                          Evaluation Prompt Preview
                          <Skeleton className="h-[25px] w-[63px]" />
                        </div>
                        <div className="flex justify-end">
                          {mappingControlButtons}
                        </div>
                      </div>
                      <div className="flex h-full w-full flex-1 items-center justify-center rounded border">
                        <p className="text-center text-sm text-muted-foreground">
                          No trace data found, please adjust filters or switch
                          to not show preview.
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  <JSONView
                    title={"Evaluation Prompt"}
                    json={evalTemplate.prompt ?? null}
                    className={cn(
                      "min-h-48 bg-muted/50",
                      !shouldWrapVariables && "lg:w-2/3",
                    )}
                    codeClassName="flex-1"
                    collapseStringsAfterLength={null}
                    controlButtons={mappingControlButtons}
                  />
                )}
                <div
                  className={cn(
                    "flex flex-col gap-2",
                    !shouldWrapVariables && "lg:w-1/3",
                  )}
                >
                  {isLegacyEvalTarget(form.watch("target")) // Complex variable mapping for trace/dataset targets (legacy)
                    ? fields.map((mappingField, index) => (
                        <Card className="flex flex-col gap-2 p-4" key={index}>
                          <div
                            className={cn(
                              "text-sm font-semibold",
                              getVariableColor(index),
                            )}
                          >
                            {"{{"}
                            {mappingField.templateVariable}
                            {"}}"}
                            <DocPopup
                              description={
                                "Variable in the template to be replaced with the mapped data."
                              }
                              href={
                                "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                              }
                            />
                          </div>
                          <FormField
                            control={form.control}
                            key={`${mappingField.id}-langfuseObject`}
                            name={`mapping.${index}.langfuseObject`}
                            render={({ field }) => (
                              <div className="flex items-center gap-2">
                                <VariableMappingDescription
                                  title="Object"
                                  description={
                                    "Langfuse object to retrieve the data from."
                                  }
                                  href={
                                    "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                  }
                                />
                                <FormItem className="w-2/3">
                                  <FormControl>
                                    <Select
                                      disabled={disabled}
                                      defaultValue={field.value}
                                      onValueChange={(value) => {
                                        field.onChange(value);
                                        form.setValue(
                                          `mapping.${index}.objectName`,
                                          undefined,
                                        );
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableVariables.map(
                                          (evalObject) => (
                                            <SelectItem
                                              value={evalObject.id}
                                              key={evalObject.id}
                                            >
                                              {evalObject.display}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              </div>
                            )}
                          />

                          {!isTraceOrDatasetObject(
                            form.watch(`mapping.${index}.langfuseObject`) ?? "",
                          ) ? (
                            <FormField
                              control={form.control}
                              key={`${mappingField.id}-objectName`}
                              name={`mapping.${index}.objectName`}
                              render={({ field }) => {
                                const type = String(
                                  form.watch(`mapping.${index}.langfuseObject`),
                                ).toUpperCase();
                                const nameOptions = Array.from(
                                  namesByObject.get(type) ?? [],
                                );
                                const isCustomOption =
                                  field.value === "custom" ||
                                  (field.value &&
                                    !nameOptions.includes(field.value));
                                return (
                                  <div className="flex items-center gap-2">
                                    <VariableMappingDescription
                                      title={"Object Name"}
                                      description={
                                        "Name of the Langfuse object to retrieve the data from."
                                      }
                                      href={
                                        "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                      }
                                    />
                                    <FormItem className="w-2/3">
                                      <FormControl>
                                        {isCustomOption ? (
                                          <div className="flex flex-col gap-2">
                                            <Select
                                              onValueChange={(value) => {
                                                if (value !== "custom") {
                                                  field.onChange(value);
                                                }
                                              }}
                                              value="custom"
                                              disabled={disabled}
                                            >
                                              <SelectTrigger>
                                                <SelectValue>
                                                  Enter name...
                                                </SelectValue>
                                              </SelectTrigger>
                                              <SelectContent>
                                                {nameOptions?.map((name) => (
                                                  <SelectItem
                                                    key={name}
                                                    value={name}
                                                  >
                                                    {name}
                                                  </SelectItem>
                                                ))}
                                                <SelectItem
                                                  key="custom"
                                                  value="custom"
                                                >
                                                  Enter name...
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                            <Input
                                              value={
                                                field.value === "custom"
                                                  ? ""
                                                  : field.value || ""
                                              }
                                              onChange={(e) =>
                                                field.onChange(e.target.value)
                                              }
                                              placeholder="Enter langfuse object name"
                                              disabled={disabled}
                                            />
                                          </div>
                                        ) : (
                                          <Select
                                            {...field}
                                            value={field.value ?? ""}
                                            onValueChange={field.onChange}
                                            disabled={disabled}
                                          >
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {nameOptions?.map((name) => (
                                                <SelectItem
                                                  key={name}
                                                  value={name}
                                                >
                                                  {name}
                                                </SelectItem>
                                              ))}
                                              <SelectItem
                                                key="custom"
                                                value="custom"
                                              >
                                                Enter name...
                                              </SelectItem>
                                            </SelectContent>
                                          </Select>
                                        )}
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  </div>
                                );
                              }}
                            />
                          ) : undefined}

                          <FormField
                            control={form.control}
                            key={`${mappingField.id}-selectedColumnId`}
                            name={`mapping.${index}.selectedColumnId`}
                            render={({ field }) => (
                              <div className="flex items-center gap-2">
                                <VariableMappingDescription
                                  title={"Object Field"}
                                  description={
                                    "Field on the Langfuse object to insert into the template."
                                  }
                                  href={
                                    "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                  }
                                />
                                <FormItem className="w-2/3">
                                  <FormControl>
                                    <Select
                                      disabled={disabled}
                                      defaultValue={field.value ?? undefined}
                                      onValueChange={(value) => {
                                        const availableColumns =
                                          availableVariables.find(
                                            (evalObject) =>
                                              evalObject.id ===
                                              form.watch(
                                                `mapping.${index}.langfuseObject`,
                                              ),
                                          )?.availableColumns;

                                        const column = availableColumns?.find(
                                          (column) => column.id === value,
                                        );

                                        field.onChange(column?.id);
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Object type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableVariables
                                          .find(
                                            (evalObject) =>
                                              evalObject.id ===
                                              form.watch(
                                                `mapping.${index}.langfuseObject`,
                                              ),
                                          )
                                          ?.availableColumns.map((column) => (
                                            <SelectItem
                                              value={column.id}
                                              key={column.id}
                                            >
                                              {column.name}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              </div>
                            )}
                          />
                          {fieldHasJsonSelectorOption(
                            form.watch(`mapping.${index}.selectedColumnId`),
                          ) ? (
                            <FormField
                              control={form.control}
                              key={`${mappingField.id}-jsonSelector`}
                              name={`mapping.${index}.jsonSelector`}
                              render={({ field }) => (
                                <div className="flex items-center gap-2">
                                  <VariableMappingDescription
                                    title={"JsonPath"}
                                    description={
                                      "Optional selection: Use JsonPath syntax to select from a JSON object stored on a trace. If not selected, we will pass the entire object into the prompt."
                                    }
                                    href={
                                      "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                    }
                                  />
                                  <FormItem className="w-2/3">
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        disabled={disabled}
                                        placeholder="Optional"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                </div>
                              )}
                            />
                          ) : undefined}
                        </Card>
                      ))
                    : // Simplified variable mapping for event/experiment targets
                      fields.map((mappingField, index) => (
                        <Card className="flex flex-col gap-2 p-4" key={index}>
                          <div
                            className={cn(
                              "text-sm font-semibold",
                              getVariableColor(index),
                            )}
                          >
                            {"{{"}
                            {mappingField.templateVariable}
                            {"}}"}
                            <DocPopup
                              description={
                                "Variable in the template to be replaced with the mapped data."
                              }
                              href={
                                "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                              }
                            />
                          </div>
                          {hideAdvancedSettings && (
                            <div className="flex items-center gap-2">
                              <VariableMappingDescription
                                title="Object"
                                description="Type of object to retrieve the data from."
                                href="https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                              />
                              <div className="w-2/3">
                                <Input
                                  value={
                                    isEventTarget(form.watch("target"))
                                      ? "Observation"
                                      : "Experiment item"
                                  }
                                  disabled
                                />
                              </div>
                            </div>
                          )}
                          <FormField
                            control={form.control}
                            key={`${mappingField.id}-selectedColumnId`}
                            name={`mapping.${index}.selectedColumnId`}
                            render={({ field }) => {
                              // Filter columns based on target
                              // For observations (event), exclude experiment-specific fields
                              const availableColumns =
                                form.watch("target") === EvalTargetObject.EVENT
                                  ? observationEvalVariableColumns.filter(
                                      (col) =>
                                        col.id !==
                                        "experimentItemExpectedOutput",
                                    )
                                  : observationEvalVariableColumns;

                              return (
                                <div className="flex items-center gap-2">
                                  <VariableMappingDescription
                                    title={"Object Field"}
                                    description={
                                      "Observation field to insert into the template."
                                    }
                                    href={
                                      "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                    }
                                  />
                                  <FormItem className="w-2/3">
                                    <FormControl>
                                      <Select
                                        disabled={disabled}
                                        defaultValue={field.value ?? undefined}
                                        onValueChange={field.onChange}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select field" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableColumns.map((column) => (
                                            <SelectItem
                                              value={column.id}
                                              key={column.id}
                                            >
                                              {column.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                </div>
                              );
                            }}
                          />
                          {(form.watch(`mapping.${index}.selectedColumnId`) ===
                            "metadata" ||
                            form.watch(`mapping.${index}.selectedColumnId`) ===
                              "input" ||
                            form.watch(`mapping.${index}.selectedColumnId`) ===
                              "output" ||
                            form.watch(`mapping.${index}.selectedColumnId`) ===
                              "experimentItemExpectedOutput") && (
                            <FormField
                              control={form.control}
                              key={`${mappingField.id}-jsonSelector`}
                              name={`mapping.${index}.jsonSelector`}
                              render={({ field }) => (
                                <div className="flex items-center gap-2">
                                  <VariableMappingDescription
                                    title={"JsonPath"}
                                    description={
                                      "Optional selection: Use JsonPath syntax to select from a JSON object. If not selected, we will pass the entire object into the prompt."
                                    }
                                    href={
                                      "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge"
                                    }
                                  />
                                  <FormItem className="w-2/3">
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        disabled={disabled}
                                        placeholder="Optional"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                </div>
                              )}
                            />
                          )}
                        </Card>
                      ))}
                </div>
              </div>
              <FormMessage />
            </>
          )}
        />
      </div>
    </Card>
  );
};
