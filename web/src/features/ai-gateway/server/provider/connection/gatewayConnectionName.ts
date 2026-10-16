import { InvalidRequestError } from "@langfuse/shared";

import {
  GATEWAY_CONNECTION_NAME_ERRORS,
  GATEWAY_CONNECTION_NAME_MAX_LENGTH,
} from "@/src/features/ai-gateway/constants/gatewayConnection";

// The name becomes the `<name>:` prefix of model slugs, so it must survive
// being pasted into SDK configs, URLs, and env vars unchanged.
const CONNECTION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// `ft:` already prefixes OpenAI fine-tuned model IDs; a connection with that
// name would make those slugs ambiguous.
const RESERVED_CONNECTION_NAMES = new Set(["ft"]);

export function parseGatewayConnectionName(rawName: string): string {
  const name = rawName.trim();
  if (!name) {
    throw new InvalidRequestError(GATEWAY_CONNECTION_NAME_ERRORS.required);
  }
  if (name.length > GATEWAY_CONNECTION_NAME_MAX_LENGTH) {
    throw new InvalidRequestError(GATEWAY_CONNECTION_NAME_ERRORS.tooLong);
  }
  if (!CONNECTION_NAME_PATTERN.test(name)) {
    throw new InvalidRequestError(
      GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters,
    );
  }
  if (RESERVED_CONNECTION_NAMES.has(name.toLowerCase())) {
    throw new InvalidRequestError(GATEWAY_CONNECTION_NAME_ERRORS.reserved);
  }
  return name;
}
