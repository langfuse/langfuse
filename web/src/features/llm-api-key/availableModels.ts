import { type LLMAdapter, supportedModels } from "@langfuse/shared";

/** Returns a connection's custom models plus, if enabled, its adapter's default models. */
export function getConnectionAvailableModels(connection: {
  adapter: LLMAdapter;
  customModels: string[];
  withDefaultModels: boolean;
}): string[] {
  return Array.from(
    new Set([
      ...connection.customModels,
      ...(connection.withDefaultModels
        ? supportedModels[connection.adapter]
        : []),
    ]),
  );
}
