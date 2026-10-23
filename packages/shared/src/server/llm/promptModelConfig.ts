import z from "zod";

import { ZodModelConfig, type ModelConfig } from "./types";

/**
 * The canonical model-selection keys a prompt's `config` may carry, alongside
 * the tool definitions read by `parsePromptToolConfig`.
 */
export const PromptModelConfigSchema = ZodModelConfig.extend({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export type PromptModelConfigValue = {
  provider?: string;
  model?: string;
} & ModelConfig;

export type PromptModelConfig =
  | { status: "none" }
  | { status: "valid"; modelConfig: PromptModelConfigValue }
  | { status: "invalid" };

const PROMPT_MODEL_CONFIG_KEYS = Object.keys(
  PromptModelConfigSchema.shape,
) as (keyof PromptModelConfigValue)[];

export const PROMPT_MODEL_CONFIG_INVALID_MESSAGE =
  "This prompt's config carries model settings that could not be read - the model and parameters below are not taken from the prompt";

/**
 * Extracts the model and inference parameters from a prompt's free-form
 * `config` JSON.
 *
 * `config` is an arbitrary JSON object by contract, so this reads the keys it
 * knows and ignores the rest. Numeric parameters are coerced, because a config
 * authored by hand or by an SDK may carry `"0.7"` where a number is meant.
 *
 * - `none`: config carries no model settings — the caller keeps its own
 *   defaults.
 * - `valid`: every recognised key parsed. `model` may still be absent: a config
 *   that pins only `temperature` says nothing about which model to run.
 * - `invalid`: recognised keys exist but cannot be used as a whole. Callers
 *   must ignore ALL of them and surface a warning — applying a partially read
 *   model config would silently run something other than what the prompt says.
 */
export function parsePromptModelConfig(config: unknown): PromptModelConfig {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { status: "none" };
  }

  const record = config as Record<string, unknown>;
  const presentKeys = PROMPT_MODEL_CONFIG_KEYS.filter(
    (key) => record[key] !== undefined && record[key] !== null,
  );
  if (presentKeys.length === 0) {
    return { status: "none" };
  }

  const parsed = PromptModelConfigSchema.safeParse(config);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  return { status: "valid", modelConfig: parsed.data };
}
