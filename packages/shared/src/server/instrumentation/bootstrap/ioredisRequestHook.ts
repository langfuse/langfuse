import { type Span } from "@opentelemetry/api";

import { API_KEY_CACHE_KEY_PREFIX } from "../../auth/apiKeyCache";

/** ioredisRequestHook records the Redis command on the span, redacting credentials and API key cache values. */
export function ioredisRequestHook(
  span: Span,
  { cmdName, cmdArgs }: { cmdName: string; cmdArgs: unknown[] },
): void {
  if (!Array.isArray(cmdArgs) || cmdArgs.length === 0) return;
  const cmd = cmdName.toUpperCase();
  if (cmd === "AUTH" || cmd === "HELLO") {
    span.setAttribute("redis.full_command", `${cmdName} [REDACTED]`);
    return;
  }
  const args = [...cmdArgs].map(String);
  if (args[0]?.includes(API_KEY_CACHE_KEY_PREFIX)) {
    for (let i = 1; i < args.length; i++) {
      args[i] = "[REDACTED]";
    }
  }
  span.setAttribute("redis.full_command", `${cmdName} ${args.join(" ")}`);
}
