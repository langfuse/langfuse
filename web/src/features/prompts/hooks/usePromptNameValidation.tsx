import { useEffect } from "react";
import { type UseFormReturn } from "react-hook-form";

interface UsePromptNameValidationProps {
  currentName: string | undefined;
  allPrompts: { value: string }[] | undefined;
  form: UseFormReturn<any>;
}

export const usePromptNameValidation = ({
  currentName,
  allPrompts,
  form,
}: UsePromptNameValidationProps) => {
  useEffect(() => {
    if (!currentName) return;

    const isNewPrompt = !allPrompts
      ?.map((prompt) => prompt.value)
      .includes(currentName);

    if (!isNewPrompt) {
      form.setError("name", { message: "Prompt name already exists." });
    } else if (currentName === "new") {
      form.setError("name", { message: "Prompt name cannot be 'new'" });
    } else if (!/^[a-zA-Z0-9_\-.]+$/.test(currentName)) {
      form.setError("name", {
        message:
          "Name must be alphanumeric with optional underscores, hyphens, or periods",
      });
    } else {
      form.clearErrors("name");
    }
  }, [currentName, allPrompts, form]);
};
