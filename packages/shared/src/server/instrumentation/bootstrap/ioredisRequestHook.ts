import { type Span } from "@opentelemetry/api";

import { API_KEY_CACHE_KEY_PREFIX } from "../../auth/apiKeyCache";

// Values can be whole cached payloads (e.g. prompts); unbounded attributes
// inflate every span the telemetry agent has to buffer.
const MAX_ARG_LENGTH = 128;
const MAX_COMMAND_LENGTH = 1_024;

// Never split a surrogate pair: OTLP export requires valid UTF-8.
function head(value: string, max: number): string {
  const code = value.charCodeAt(max - 1);
  return value.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

function truncateArg(arg: string): string {
  return arg.length > MAX_ARG_LENGTH
    ? `${head(arg, MAX_ARG_LENGTH)}…[${arg.length} chars]`
    : arg;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${head(value, max)}…[truncated]` : value;
}

/** ioredisRequestHook records the Redis command on the span, redacting credentials and API key cache values and bounding its length. */
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
  span.setAttribute(
    "redis.full_command",
    truncate(
      `${cmdName} ${args.map(truncateArg).join(" ")}`,
      MAX_COMMAND_LENGTH,
    ),
  );
}
