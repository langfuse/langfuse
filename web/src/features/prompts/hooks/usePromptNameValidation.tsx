import { useEffect } from "react";
import { type UseFormReturn } from "react-hook-form";

interface UsePromptNameValidationProps {
  currentName: string | undefined;
  allPrompts: { value: string }[] | undefined;
  form: UseFormReturn<any>;
  errorMessage: string;
}

export const usePromptNameValidation = ({
  currentName,
  allPrompts,
  form,
  errorMessage,
}: UsePromptNameValidationProps) => {
  useEffect(() => {
    if (!currentName || !allPrompts) return;

    const isNewPrompt = !allPrompts
      ?.map((prompt) => prompt.value)
      .includes(currentName);

    if (!isNewPrompt) {
      form.setError("name", { message: errorMessage });
    } else {
      const currentError = form.getFieldState("name").error;
      if (currentError?.message === errorMessage) {
        form.clearErrors("name");
      }
    }
  }, [currentName, allPrompts, form, errorMessage]);
};
