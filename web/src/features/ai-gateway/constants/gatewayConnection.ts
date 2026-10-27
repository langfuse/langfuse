export const GATEWAY_CONNECTION_NAME_MAX_LENGTH = 64;

export const GATEWAY_CONNECTION_NAME_ERRORS = {
  duplicate: "A provider credential with this name already exists.",
  required: "Enter a connection name.",
  tooLong: `Connection names can be at most ${GATEWAY_CONNECTION_NAME_MAX_LENGTH} characters.`,
  invalidCharacters:
    "Use only letters, numbers, hyphens, and underscores, starting with a letter or number.",
  reserved: "“ft” is reserved for OpenAI fine-tuned model IDs.",
} as const;
