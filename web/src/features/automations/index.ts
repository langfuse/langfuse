// The automations feature's public client surface (RFC rule 8). Named
// re-exports only — the form, button, and webhook secret UI other
// features already imported by file path.
//
// automationsRouter and the automations page stay off this door.
export { AutomationButton } from "@/src/features/automations/components/AutomationButton";
export {
  AutomationForm,
  automationCreateHref,
} from "@/src/features/automations/components/AutomationForm";
export { actionTypeLabel } from "@/src/features/automations/actionTypeLabels";
export {
  availableActionTypes,
  isInternalActionType,
} from "@/src/features/automations/internalActionTypes";
export { WebhookSecretRender } from "@/src/features/automations/components/WebhookSecretRender";
