// The automations feature's public client surface (RFC rule 8). Named
// re-exports only — the form, button, and webhook secret UI other
// features already imported by file path.
//
// automationsRouter and the automations page stay off this door.
export { AutomationButton } from "@/src/features/automations/components/AutomationButton";
export {
  AutomationForm,
  automationCreateHref,
} from "@/src/features/automations/components/automationForm";
export { WebhookSecretRender } from "@/src/features/automations/components/WebhookSecretRender";
