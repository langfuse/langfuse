import { type UseFormReturn, type FieldValues } from "react-hook-form";
import {
  type ActionDomain,
  type ActionType,
  type AutomationDomain,
  type SafeWebhookActionConfig,
} from "@langfuse/shared";

export interface BaseActionHandler<
  TFormData extends FieldValues = FieldValues,
> {
  actionType: ActionType;

  // Get default values for this action type
  getDefaultValues(automation?: AutomationDomain): TFormData;

  // Validate the form data for this action type
  validateFormData(formData: TFormData): {
    isValid: boolean;
    errors?: string[];
  };

  // Build the action config for API submission
  buildActionConfig(
    formData: TFormData,
  ): Omit<SafeWebhookActionConfig, "displaySecretKey">;

  // Render the action form UI - using any for form to allow flexibility
  renderForm(props: {
    form: UseFormReturn<any>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }): React.ReactNode;
}
