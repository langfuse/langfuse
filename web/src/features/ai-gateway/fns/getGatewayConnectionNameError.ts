import {
  GATEWAY_CONNECTION_NAME_ERRORS,
  GATEWAY_CONNECTION_NAME_MAX_LENGTH,
} from "@/src/features/ai-gateway/constants/gatewayConnection";

/** Keeps the `<name>:` model slug prefix safe in SDK configs, URLs, and env vars. */
const CONNECTION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** `ft` collides with the `ft:` prefix of OpenAI fine-tuned model IDs. */
const RESERVED_CONNECTION_NAMES = new Set(["ft"]);

/** Returns the format rule a trimmed connection name breaks, or `null`. */
export function getGatewayConnectionNameError(name: string) {
  if (!name) return GATEWAY_CONNECTION_NAME_ERRORS.required;
  if (name.length > GATEWAY_CONNECTION_NAME_MAX_LENGTH) {
    return GATEWAY_CONNECTION_NAME_ERRORS.tooLong;
  }
  if (!CONNECTION_NAME_PATTERN.test(name)) {
    return GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters;
  }
  if (RESERVED_CONNECTION_NAMES.has(name.toLowerCase())) {
    return GATEWAY_CONNECTION_NAME_ERRORS.reserved;
  }
  return null;
}
