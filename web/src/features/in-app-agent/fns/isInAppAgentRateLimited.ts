import { type InAppAgentError } from "@/src/features/in-app-agent/components/ControlledInAppAgentWindow/fns/utils";

export function isInAppAgentRateLimited(
  error: InAppAgentError | null,
  now = Date.now(),
) {
  return error?.type === "rate_limit" && error.retryAt > now;
}
