import { createHash } from "node:crypto";
import { z } from "zod";

export const IN_APP_AGENT_SCRIPT_EXECUTION_TOOL_NAME = "run_approved_script";

export const SDK_GATEWAY_ROUTE_PREFIX = "/api/in-app-agent/sdk-gateway";

export const InAppAgentScriptExecutionState = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
  UNKNOWN: "UNKNOWN",
} as const;

export type InAppAgentScriptExecutionState =
  (typeof InAppAgentScriptExecutionState)[keyof typeof InAppAgentScriptExecutionState];

export const InAppAgentScriptExecutionStateSchema = z.enum([
  InAppAgentScriptExecutionState.PENDING,
  InAppAgentScriptExecutionState.RUNNING,
  InAppAgentScriptExecutionState.SUCCEEDED,
  InAppAgentScriptExecutionState.FAILED,
  InAppAgentScriptExecutionState.TIMED_OUT,
  InAppAgentScriptExecutionState.UNKNOWN,
]);

export const IN_APP_AGENT_SCRIPT_EXECUTION_TERMINAL_STATES = [
  InAppAgentScriptExecutionState.SUCCEEDED,
  InAppAgentScriptExecutionState.FAILED,
  InAppAgentScriptExecutionState.TIMED_OUT,
  InAppAgentScriptExecutionState.UNKNOWN,
] as const;

export function isTerminalScriptExecutionState(
  state: string,
): state is (typeof IN_APP_AGENT_SCRIPT_EXECUTION_TERMINAL_STATES)[number] {
  return (
    IN_APP_AGENT_SCRIPT_EXECUTION_TERMINAL_STATES as readonly string[]
  ).includes(state);
}

export const InAppAgentScriptExecutionLimitsSchema = z.object({
  lifetimeMs: z
    .number()
    .int()
    .positive()
    .max(10 * 60_000),
  modelAttempts: z.number().int().nonnegative().max(50),
  modelConcurrency: z.number().int().positive().max(2),
  modelRequestsPerMinute: z.number().int().positive().max(30),
  modelInputBytes: z.number().int().positive(),
  modelOutputTokens: z.number().int().positive().max(2_048),
  sdkRequests: z.number().int().positive().max(500),
  sdkConcurrency: z.number().int().positive().max(4),
  sdkRequestsPerSecond: z.number().int().positive().max(20),
  ingestionEvents: z.number().int().positive().max(1_000),
  encodedBodyBytes: z.number().int().positive(),
  decodedBodyBytes: z.number().int().positive(),
  capturedOutputBytes: z.number().int().positive(),
});

export type InAppAgentScriptExecutionLimits = z.infer<
  typeof InAppAgentScriptExecutionLimitsSchema
>;

export const IN_APP_AGENT_SCRIPT_EXECUTION_DEFAULT_LIMITS: InAppAgentScriptExecutionLimits =
  {
    lifetimeMs: 10 * 60_000,
    modelAttempts: 50,
    modelConcurrency: 2,
    modelRequestsPerMinute: 30,
    modelInputBytes: 64 * 1024,
    modelOutputTokens: 2_048,
    sdkRequests: 500,
    sdkConcurrency: 4,
    sdkRequestsPerSecond: 20,
    ingestionEvents: 1_000,
    encodedBodyBytes: 1 * 1024 * 1024,
    decodedBodyBytes: 4 * 1024 * 1024,
    capturedOutputBytes: 128 * 1024,
  };

export const EXECUTION_PUBLIC_KEY_PREFIX = "lf-exec-";

export function executionPublicKey(credentialId: string): string {
  return `${EXECUTION_PUBLIC_KEY_PREFIX}${credentialId}`;
}

export function parseExecutionPublicKey(publicKey: string): string | undefined {
  if (!publicKey.startsWith(EXECUTION_PUBLIC_KEY_PREFIX)) {
    return undefined;
  }

  const credentialId = publicKey.slice(EXECUTION_PUBLIC_KEY_PREFIX.length);
  return credentialId.length > 0 ? credentialId : undefined;
}

export function digestScript(script: string): string {
  return createHash("sha256").update(script, "utf8").digest("hex");
}

export function digestExecutionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
