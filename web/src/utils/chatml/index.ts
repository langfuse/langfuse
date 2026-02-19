// Re-export from shared (core functions moved to enable worker testing)
export {
  mapToChatMl,
  mapOutputToChatMl,
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
  normalizeInput,
  normalizeOutput,
  selectAdapter,
  type NormalizerContext,
  type ProviderAdapter,
  type ToolEvent,
} from "@langfuse/shared";
