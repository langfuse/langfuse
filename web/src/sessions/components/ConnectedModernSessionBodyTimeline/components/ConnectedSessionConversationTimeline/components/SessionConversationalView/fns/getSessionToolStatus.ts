import { type Observation } from "@langfuse/shared";

export function getSessionToolStatus({
  level,
  statusMessage,
  isError,
}: {
  level: Observation["level"] | undefined;
  statusMessage: Observation["statusMessage"] | undefined;
  isError: boolean | undefined;
}) {
  if (isError) {
    return {
      level: "ERROR" as const,
      statusMessage: statusMessage || "Tool failed",
    };
  }
  return { level, statusMessage };
}
