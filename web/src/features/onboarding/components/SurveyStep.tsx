import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Textarea } from "@/src/components/ui/textarea";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import type { Control, Path } from "react-hook-form";
import type { SurveyQuestion, SurveyFormData } from "../lib/surveyTypes";

const AUTO_ADVANCE_DELAY = 300;

interface SurveyStepProps {
  question: SurveyQuestion;
  control: Control<SurveyFormData>;
  onAutoAdvance?: (selectedValue?: string) => void;
  isLast?: boolean;
}

export function SurveyStep({
  question,
  control,
  onAutoAdvance,
  isLast = false,
}: SurveyStepProps) {
  const fieldName = question.id as keyof SurveyFormData;

  const handleAutoAdvanceWithTimeout = (selectedValue?: string) => {
    if (onAutoAdvance) {
      // For signupReason question, ignore isLast and let the hook decide
      // For other questions, respect the isLast prop
      const shouldAutoAdvance = question.id === "signupReason" || !isLast;

      if (shouldAutoAdvance) {
        setTimeout(() => {
          onAutoAdvance(selectedValue);
        }, AUTO_ADVANCE_DELAY);
      }
    }
  };

  if (question.type === "radio") {
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
              <RadioGroup
                name={field.name}
                ref={field.ref}
                onValueChange={(value) => {
                  field.onChange(value);
                  setTimeout(() => {
                    handleAutoAdvanceWithTimeout(value);
                  }, 0);
                }}
                value={field.value as string}
                className="grid gap-3"
              >
                {question.options.map((option) => (
                  <Label
                    key={option}
                    htmlFor={option}
                    className="flex flex-1 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm font-medium leading-none transition-colors hover:bg-muted/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    <RadioGroupItem value={option} id={option} />
                    <span className="flex-1">{option}</span>
                  </Label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  if (question.type === "text") {
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
              {question.id === "referralSource" ? (
                <Input placeholder={question.placeholder} {...field} />
              ) : (
                <Textarea
                  placeholder={question.placeholder}
                  className="min-h-[170px] resize-none"
                  {...field}
                />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  return null;
}
