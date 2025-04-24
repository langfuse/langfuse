import { useEffect } from "react";
import { type UseFormReturn } from "react-hook-form";

interface UseUniqueNameValidationProps {
  currentName?: string;
  allNames: { value: string }[];
  form: UseFormReturn<any>;
  errorMessage: string;
}

export const useUniqueNameValidation = ({
  currentName,
  allNames,
  form,
  errorMessage,
}: UseUniqueNameValidationProps) => {
  useEffect(() => {
    if (!currentName) {
      form.clearErrors("name");
      return;
    }

    const isNewName = !allNames.map((name) => name.value).includes(currentName);

    if (!isNewName) {
      form.setError("name", {
        message: errorMessage,
      });
    } else {
      form.clearErrors("name");
    }
  }, [currentName, allNames, form, errorMessage]);
};
