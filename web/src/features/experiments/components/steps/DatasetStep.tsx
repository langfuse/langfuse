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
import { CheckCircle, XCircle, Info } from "lucide-react";
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
  // Compute validation state from the result
  const configValidationState: "valid" | "warning" | "invalid" =
    validationResult?.isValid === false
      ? "invalid"
      : validationResult?.isValid === true
        ? "valid"
        : "warning";

  const configValidationDetails = {
    title: validationResult?.isValid
      ? "Valid configuration"
      : "Invalid configuration",
    description:
      validationResult?.isValid === false
        ? validationResult.message
        : "Validating configuration...",
    inputVariableValidation: {
      valid: expectedColumns.inputVariables || [],
      invalid: [] as string[],
    },
    outputValidation: {
      valid: true,
      message: "Expected output format is correct",
    },
  };

  const getValidationIcon = () => {
    if (configValidationState === "valid")
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (configValidationState === "warning")
      return <Info className="h-5 w-5 text-yellow-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getValidationColor = () => {
    if (configValidationState === "valid") return "border-green-600";
    if (configValidationState === "warning") return "border-yellow-600";
    return "border-red-600";
  };

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
                  {datasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPromptName && selectedPromptVersion !== null && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
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
        <Card className={`border-2 ${getValidationColor()}`}>
          <CardHeader>
            <div className="flex items-start gap-3">
              {getValidationIcon()}
              <div className="space-y-1.5">
                <CardTitle className="text-base">
                  {configValidationDetails.title}
                </CardTitle>
                <CardDescription>
                  {configValidationDetails.description}
                </CardDescription>

                {configValidationDetails.inputVariableValidation.valid.length >
                  0 && (
                  <div className="pt-2">
                    <p className="text-sm font-medium text-green-600">
                      ✓ Valid input variables:
                    </p>
                    <ul className="list-inside list-disc text-sm text-muted-foreground">
                      {configValidationDetails.inputVariableValidation.valid.map(
                        (variable) => (
                          <li key={variable}>{variable}</li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                {configValidationDetails.inputVariableValidation.invalid
                  .length > 0 && (
                  <div className="pt-2">
                    <p className="text-sm font-medium text-red-600">
                      ✗ Missing input variables:
                    </p>
                    <ul className="list-inside list-disc text-sm text-muted-foreground">
                      {configValidationDetails.inputVariableValidation.invalid.map(
                        (variable) => (
                          <li key={variable}>{variable}</li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                <div className="pt-2">
                  <p
                    className={`text-sm font-medium ${
                      configValidationDetails.outputValidation.valid
                        ? "text-green-600"
                        : "text-yellow-600"
                    }`}
                  >
                    {configValidationDetails.outputValidation.valid
                      ? "✓"
                      : "⚠"}{" "}
                    Expected output:
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {configValidationDetails.outputValidation.message}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
};
