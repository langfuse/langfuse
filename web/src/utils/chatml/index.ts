// Re-export from shared (core functions moved to enable worker testing)
export {
  
  
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
  normalizeInput,
  normalizeOutput,
  
  type NormalizerContext,
  type ProviderAdapter,
  type ToolEvent,
} from "@langfuse/shared";
