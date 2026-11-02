// Re-export from shared (core functions moved to enable worker testing)
export {
  cleanLegacyOutput,
  extractAdditionalInput,
  combineInputOutputMessages,
  normalizeInput,
  normalizeOutput,
} from "@langfuse/shared";
