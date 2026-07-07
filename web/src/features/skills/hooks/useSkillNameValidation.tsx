import { useEffect } from "react";
import { type UseFormReturn } from "react-hook-form";

interface UseSkillNameValidationProps {
  currentName: string | undefined;
  allSkills: { value: string }[] | undefined;
  form: UseFormReturn<any>;
}

export const useSkillNameValidation = ({
  currentName,
  allSkills,
  form,
}: UseSkillNameValidationProps) => {
  useEffect(() => {
    if (!currentName || !allSkills) return;

    const isNewSkill = !allSkills
      ?.map((skill) => skill.value)
      .includes(currentName);

    if (!isNewSkill) {
      form.setError("name", { message: "Skill name already exists." });
    } else {
      const currentError = form.getFieldState("name").error;
      if (currentError?.message === "Skill name already exists.") {
        form.clearErrors("name");
      }
    }
  }, [currentName, allSkills, form]);
};
