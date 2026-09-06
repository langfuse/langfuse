import React, { useState } from "react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandList,
  InputCommand,
  InputCommandItem,
} from "@/src/components/ui/input-command";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Info, CircleCheck, ChevronDown, CheckIcon } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { type DatasetStepProps } from "@/src/features/experiments/types/stepProps";
import { StepHeader } from "@/src/features/experiments/components/shared/StepHeader";
import { api } from "@/src/utils/api";
import { useLocale, useTranslations } from "next-intl";

export const DatasetStep: React.FC<DatasetStepProps> = ({
  projectId,
  formState,
  datasetState,
  promptInfo,
}) => {
  const t = useTranslations("evaluationAnalytics.experiments");
  const locale = useLocale();
  const { form } = formState;
  const {
    datasets,
    selectedDatasetId,
    expectedColumnsForDataset: expectedColumns,
    validationResult,
  } = datasetState;
  const { selectedPromptName, selectedPromptVersion } = promptInfo;
  const [datasetPopoverOpen, setDatasetPopoverOpen] = useState(false);
  const validationErrorMessage =
    validationResult?.isValid === false
      ? {
          PROMPT_NOT_FOUND: t("validation.promptNotFound"),
          PROMPT_HAS_NO_VARIABLES: t("validation.promptHasNoVariables"),
          DATASET_EMPTY: t("validation.datasetEmpty"),
          DATASET_ITEMS_HAVE_NO_VARIABLES: t(
            "validation.datasetItemsHaveNoVariables",
          ),
        }[validationResult.code]
      : undefined;

  // Fetch dataset versions when a dataset is selected
  const { data: datasetVersions } = api.datasets.listDatasetVersions.useQuery(
    {
      projectId,
      datasetId: selectedDatasetId || "",
    },
    {
      enabled: !!selectedDatasetId,
    },
  );

  return (
    <div className="space-y-6">
      <StepHeader
        title={t("steps.dataset.title")}
        description={t("steps.dataset.description")}
      />

      <FormField
        control={form.control}
        name="datasetId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("common.dataset")}</FormLabel>
            <div className="flex items-center gap-2">
              <Popover
                open={datasetPopoverOpen}
                onOpenChange={setDatasetPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={datasetPopoverOpen}
                    className="flex-1 justify-between px-2 font-normal"
                  >
                    {field.value
                      ? datasets?.find((d) => d.id === field.value)?.name
                      : t("common.selectDataset")}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-(--radix-popover-trigger-width) overflow-auto p-0"
                  align="start"
                >
                  <InputCommand>
                    <InputCommandInput
                      placeholder={t("common.searchDatasets")}
                      className="h-9"
                      variant="bottom"
                    />
                    <InputCommandList>
                      <InputCommandEmpty>
                        {t("common.noDatasetFound")}
                      </InputCommandEmpty>
                      <InputCommandGroup>
                        {(datasets ?? []).map((dataset) => (
                          <InputCommandItem
                            key={dataset.id}
                            onSelect={() => {
                              field.onChange(dataset.id);
                              form.clearErrors("datasetId");
                              setDatasetPopoverOpen(false);
                            }}
                          >
                            {dataset.name}
                            <CheckIcon
                              className={cn(
                                "ml-auto h-4 w-4",
                                dataset.id === field.value
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                          </InputCommandItem>
                        ))}
                      </InputCommandGroup>
                    </InputCommandList>
                  </InputCommand>
                </PopoverContent>
              </Popover>

              {selectedPromptName && selectedPromptVersion !== null && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-8">
                      {t("steps.dataset.expectedColumns")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="leading-none font-bold">
                        {t("steps.dataset.expectedStructure")}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t("steps.dataset.basedOnPrompt", {
                          name: selectedPromptName,
                          version: selectedPromptVersion,
                        })}
                      </p>
                      <div className="space-y-1 pt-2">
                        <p className="text-sm font-bold">
                          {t("steps.dataset.inputVariables")}:
                        </p>
                        <ul className="list-inside list-disc text-sm">
                          {expectedColumns.inputVariables.map((variable) => (
                            <li key={variable}>{variable}</li>
                          ))}
                        </ul>
                        <p className="text-sm font-bold">
                          {t("steps.dataset.expectedOutput")}:
                        </p>
                        <ul className="list-inside list-disc text-sm">
                          <li>
                            {expectedColumns.outputVariableName} (
                            {expectedColumns.outputVariableType})
                          </li>
                        </ul>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {selectedDatasetId && datasetVersions && datasetVersions.length > 0 && (
        <FormField
          control={form.control}
          name="datasetVersion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("steps.dataset.versionOptional")}</FormLabel>
              <Select
                onValueChange={(value) => {
                  if (value === "latest") {
                    field.onChange(undefined);
                  } else {
                    field.onChange(new Date(value));
                  }
                }}
                value={field.value ? field.value.toISOString() : "latest"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("steps.dataset.latestVersion")}
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="latest">
                    {t("steps.dataset.latestVersionDefault")}
                  </SelectItem>
                  {datasetVersions.map((version) => (
                    <SelectItem
                      key={version.toISOString()}
                      value={version.toISOString()}
                    >
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "UTC",
                      }).format(version)}{" "}
                      (UTC)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {t("steps.dataset.versionDescription")}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {selectedDatasetId && (
        <>
          {validationResult?.isValid === false && (
            <Card className="border-dark-yellow bg-light-yellow relative overflow-hidden rounded-md shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="text-dark-yellow flex items-center justify-between text-sm">
                  <span>{t("steps.dataset.invalidConfiguration")}</span>
                  <Info className="h-4 w-4" />
                </CardTitle>
                <CardDescription className="text-foreground">
                  {validationErrorMessage}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {validationResult?.isValid === true && (
            <Card className="border-dark-green bg-light-green relative overflow-hidden rounded-md shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="text-dark-green flex items-center justify-between text-sm">
                  <span>{t("steps.dataset.validConfiguration")}</span>
                  <CircleCheck className="h-4 w-4" />
                </CardTitle>
                <div className="text-sm">
                  {t("steps.dataset.matchesDescription")}
                  <ul className="my-2 ml-2 list-inside list-disc">
                    {Object.entries(validationResult.variablesMap ?? {}).map(
                      ([variable, count]) => (
                        <li key={variable}>
                          <strong>{variable}:</strong> {count} /{" "}
                          {validationResult?.isValid
                            ? validationResult.totalItems
                            : t("common.unknown")}
                        </li>
                      ),
                    )}
                  </ul>
                  {t("steps.dataset.missingItemsExcluded")}
                </div>
              </CardHeader>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
