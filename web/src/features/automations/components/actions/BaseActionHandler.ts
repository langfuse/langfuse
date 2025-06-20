import { type UseFormReturn, type FieldValues } from "react-hook-form";
import { type ActionType, type ActionConfigSchema } from "@langfuse/shared";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import { type z } from "zod/v4";

type ActionConfig = z.infer<typeof ActionConfigSchema>;

export interface BaseActionHandler<
  TFormData extends FieldValues = FieldValues,
> {
  actionType: ActionType;

  // Get default values for this action type
  getDefaultValues(automation?: ActiveAutomation): TFormData;

  // Validate the form data for this action type
  validateFormData(formData: TFormData): {
    isValid: boolean;
    errors?: string[];
  };

  // Build the action config for API submission
  buildActionConfig(formData: TFormData): ActionConfig;

  // Render the action form UI - using any for form to allow flexibility
  renderForm(props: {
    form: UseFormReturn<any>;
    disabled: boolean;
    projectId: string;
  }): React.ReactNode;
}
