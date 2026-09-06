import { type UseFormReturn, type FieldValues } from "react-hook-form";
import {
  type ActionCreate,
  type ActionDomain,
  type ActionType,
  type AutomationDomain,
  type TriggerEventSource,
} from "@langfuse/shared";

export type ActionValidationError =
  | {
      code:
        | "webhookUrlRequired"
        | "duplicateHeaderNames"
        | "slackChannelRequired"
        | "channelNameRequired"
        | "githubDispatchUrlRequired"
        | "eventTypeRequired"
        | "eventTypeTooLong"
        | "githubTokenRequiredForUrlChange"
        | "githubTokenRequired";
    }
  | {
      code: "headerNameEmpty" | "headerValueEmpty";
      index: number;
    }
  | {
      code: "headerVisibilityValueRequired";
      index: number;
      visibility: "public" | "secret";
    }
  | {
      code: "protectedHeader";
      index: number;
      name: string;
    };

export interface BaseActionHandler<
  TFormData extends FieldValues = FieldValues,
> {
  actionType: ActionType;

  // Get default values for this action type
  getDefaultValues(
    automation?: AutomationDomain,
    eventSource?: TriggerEventSource,
  ): TFormData;

  // Validate the form data for this action type
  validateFormData(formData: TFormData): {
    isValid: boolean;
    errors?: ActionValidationError[];
  };

  // Build the action config for API submission. `eventSource` is passed for
  // action types whose config depends on the trigger (webhooks derive their
  // payload apiVersion from it); other handlers ignore it.
  buildActionConfig(
    formData: TFormData,
    eventSource?: TriggerEventSource,
  ): ActionCreate;

  // Render the action form UI - using any for form to allow flexibility
  renderForm(props: {
    form: UseFormReturn<any>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }): React.ReactNode;
}
