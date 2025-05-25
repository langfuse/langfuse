import { type UseFormReturn } from "react-hook-form";
import { type ActionType } from "@langfuse/shared";
import { type ActiveAutomation } from "@langfuse/shared/src/server";

export interface ActionConfig {
  [key: string]: any;
}

export interface BaseActionHandler {
  actionType: ActionType;

  // Get default values for this action type
  getDefaultValues(automation?: ActiveAutomation): Record<string, any>;

  // Validate the form data for this action type
  validateFormData(formData: any): { isValid: boolean; errors?: string[] };

  // Build the action config for API submission
  buildActionConfig(formData: any): ActionConfig;

  // Render the action form UI
  renderForm(props: {
    form: UseFormReturn<any>;
    disabled: boolean;
    projectId: string;
  }): React.ReactNode;
}
