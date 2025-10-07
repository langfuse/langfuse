import React from "react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Info, CircleCheck } from "lucide-react";
import { useExperimentFormContext } from "@/src/features/experiments/context/ExperimentFormContext";

export const DatasetStep: React.FC = () => {
  const {
    form,
    datasets,
    selectedPromptName,
    selectedPromptVersion,
    selectedDatasetId,
    expectedColumnsForDataset: expectedColumns,
    validationResult,
  } = useExperimentFormContext();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Dataset Selection</h3>
        <p className="text-sm text-muted-foreground">
          Choose the dataset to run your experiment on. The dataset structure
          must match the prompt template variables.
        </p>
      </div>

      <FormField
        control={form.control}
        name="datasetId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Dataset</FormLabel>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(datasets ?? []).map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPromptName && selectedPromptVersion !== null && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-8">
                      Expected columns
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">
                        Expected Dataset Structure
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Based on prompt {selectedPromptName} v
                        {selectedPromptVersion}
                      </p>
                      <div className="space-y-1 pt-2">
                        <p className="text-sm font-medium">Input variables:</p>
                        <ul className="list-inside list-disc text-sm">
                          {expectedColumns.inputVariables.map((variable) => (
                            <li key={variable}>{variable}</li>
                          ))}
                        </ul>
                        <p className="text-sm font-medium">Expected output:</p>
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

      {selectedDatasetId && (
        <>
          {validationResult?.isValid === false && (
            <Card className="relative overflow-hidden rounded-md border-dark-yellow bg-light-yellow shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm text-dark-yellow">
                  <span>Invalid configuration</span>
                  <Info className="h-4 w-4" />
                </CardTitle>
                <CardDescription className="text-foreground">
                  {validationResult?.message}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {validationResult?.isValid === true && (
            <Card className="relative overflow-hidden rounded-md border-dark-green bg-light-green shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm text-dark-green">
                  <span>Valid configuration</span>
                  <CircleCheck className="h-4 w-4" />
                </CardTitle>
                <div className="text-sm">
                  Matches between dataset items and prompt
                  variables/placeholders
                  <ul className="my-2 ml-2 list-inside list-disc">
                    {Object.entries(validationResult.variablesMap ?? {}).map(
                      ([variable, count]) => (
                        <li key={variable}>
                          <strong>{variable}:</strong> {count} /{" "}
                          {validationResult?.isValid
                            ? validationResult.totalItems
                            : "unknown"}
                        </li>
                      ),
                    )}
                  </ul>
                  Items missing all required variables and placeholders will be
                  excluded from the dataset run.
                </div>
              </CardHeader>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
