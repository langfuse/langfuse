/**
 * Canonical usage-key alias map.
 *
 * Different ingestion paths (OTel GenAI attributes, Vercel AI SDK, Anthropic
 * provider metadata, Bedrock metadata, OpenInference, Genkit, direct SDK
 * ingestion) emit different key names for the same logical token bucket. The
 * pricing tier `Price.usageType` may use any of these names depending on how
 * the model was configured in the UI.
 *
 * This map lets `calculateUsageCosts` resolve an alias to its canonical key so
 * that cost is computed regardless of which variant the ingestion path produced
 * or which variant the user configured in the pricing tier.
 *
 * Map structure: canonicalKey → alias[]
 *   - canonicalKey is the preferred name used in seeder data and docs.
 *   - alias[] lists known alternative names that must match the same price.
 */

/**
 * Maps every known alias to its canonical key.
 * Built from CANONICAL_USAGE_KEY_ALIASES at module load.
 */
const ALIAS_TO_CANONICAL: Record<string, string> = {};

export const CANONICAL_USAGE_KEY_ALIASES: Record<string, string[]> = {
  // Reasoning output tokens (Gemini, OpenAI o-series, etc.)
  output_reasoning_tokens: [
    "output_reasoning",
    "reasoning.output_tokens",
    "reasoning_tokens",
    "completion_details.reasoning",
  ],

  // Cache-read / cached input tokens (Anthropic, OpenAI)
  input_cached_tokens: [
    "cache_read_input_tokens",
    "input_cache_read",
    "cached_tokens",
  ],

  // Cache-creation / cache-write tokens (Anthropic, Bedrock)
  input_cache_creation: [
    "cache_creation_input_tokens",
    "input_cache_write",
    "cache_write_tokens",
  ],

  // Anthropic TTL-specific cache creation buckets
  input_cache_creation_5m: [
    "cache_creation.ephemeral_5m_input_tokens",
    "ephemeral_5m_input_tokens",
  ],
  input_cache_creation_1h: [
    "cache_creation.ephemeral_1h_input_tokens",
    "ephemeral_1h_input_tokens",
  ],

  // Audio tokens
  input_audio_tokens: ["audio_input_tokens"],
  output_audio_tokens: ["audio_output_tokens"],
  output_text_tokens: ["text_output_tokens"],
};

// Build reverse lookup: alias → canonical
for (const [canonical, aliases] of Object.entries(
  CANONICAL_USAGE_KEY_ALIASES,
)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL[alias] = canonical;
  }
  // Also map canonical to itself for convenience
  ALIAS_TO_CANONICAL[canonical] = canonical;
}

/**
 * Resolve a usage_details key to its canonical form.
 * Returns the input unchanged if it is not a known alias.
 */
export function resolveUsageKeyAlias(key: string): string {
  return ALIAS_TO_CANONICAL[key] ?? key;
}
