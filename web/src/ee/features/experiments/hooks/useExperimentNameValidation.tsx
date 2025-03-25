import { useEffect } from "react";
import { type UseFormReturn } from "react-hook-form";

interface UseExperimentNameValidationProps {
  currentName: string | undefined;
  allExperimentNames: { value: string }[] | undefined;
  form: UseFormReturn<any>;
}

export const useExperimentNameValidation = ({
  currentName,
  allExperimentNames,
  form,
}: UseExperimentNameValidationProps) => {
  useEffect(() => {
    if (!currentName) {
      form.clearErrors("name");
      return;
    }

    const isNewExperiment = !allExperimentNames
      ?.map((experiment) => experiment.value)
      .includes(currentName);

    if (!isNewExperiment) {
      form.setError("name", {
        message: "Experiment name already exists for this dataset.",
      });
    } else {
      form.clearErrors("name");
    }
  }, [currentName, allExperimentNames, form]);
};
