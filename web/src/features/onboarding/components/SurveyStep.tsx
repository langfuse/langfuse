import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import type { Control, Path } from "react-hook-form";
import type { SurveyQuestion, SurveyFormData } from "../lib/surveyTypes";

interface SurveyStepProps {
  question: SurveyQuestion;
  control: Control<SurveyFormData>;
}

export function SurveyStep({ question, control }: SurveyStepProps) {
  const fieldName = question.id as keyof SurveyFormData;
  return (
    <FormField
      key={fieldName}
      control={control}
      name={fieldName as Path<SurveyFormData>}
      render={({ field }) => (
        <FormItem className="flex flex-col gap-2">
          <FormLabel className="text-xl font-semibold">
            {question.question}
          </FormLabel>
          <FormControl>
            <Input
              autoFocus
              placeholder={question.placeholder}
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
