import {
  WebhookDefaultHeaders,
  WebhookSignatureHeader,
} from "@langfuse/shared";

// Client-safe constants for the remote experiment trigger.
// Headers Langfuse controls on the outbound request; user-configured headers
// must not override them.
export const REMOTE_EXPERIMENT_PROTECTED_HEADERS = [
  ...Object.keys(WebhookDefaultHeaders),
  WebhookSignatureHeader,
];
