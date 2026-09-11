/** Must match SANDBOX_RUNTIME_PROTOCOL_VERSION in packages/in-app-agent-sandbox-runtime. */
export const IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION = 1;

export function reportedSandboxRuntimeProtocolVersion(
  healthBody: unknown,
): number {
  if (
    healthBody &&
    typeof healthBody === "object" &&
    "protocolVersion" in healthBody &&
    typeof healthBody.protocolVersion === "number" &&
    Number.isInteger(healthBody.protocolVersion)
  ) {
    return healthBody.protocolVersion;
  }

  return 0;
}

export function assertSandboxRuntimeProtocolVersion(healthBody: unknown): void {
  const reported = reportedSandboxRuntimeProtocolVersion(healthBody);

  if (reported !== IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION) {
    throw new Error(
      `Sandbox runtime protocol mismatch: image reported version ${reported}, worker expects ${IN_APP_AGENT_SANDBOX_RUNTIME_PROTOCOL_VERSION}. Rebuild the MicroVM image from this Langfuse version before running the Assistant sandbox.`,
    );
  }
}

export function isSandboxRuntimeProtocolMismatchError(
  error: unknown,
): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith("Sandbox runtime protocol mismatch:")
  );
}
