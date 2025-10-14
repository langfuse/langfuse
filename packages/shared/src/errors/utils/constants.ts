export const QUEUE_ERROR_MESSAGES = {
  API_KEY_ERROR: "API key for provider",
  NO_DEFAULT_MODEL_ERROR: "No default model or custom model found for project",
  MAPPED_DATA_ERROR:
    "Please ensure the mapped data exists and consider extending the job delay.",
  OUTPUT_TOKENS_TOO_LONG_ERROR:
    "Could not parse response content as the length limit was reached",
  INVALID_LLM_STRUCTURED_OUTPUT: "Invalid LLM response format",
} as const;
