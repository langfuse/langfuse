import { getConnectionDefaultModels, type LLMAdapter } from "@langfuse/shared";

/** Returns a connection's custom models plus, if enabled, its default models. */
export function getConnectionAvailableModels(connection: {
  adapter: LLMAdapter;
  baseURL?: string | null;
  customModels: string[];
  withDefaultModels: boolean;
}): string[] {
  return Array.from(
    new Set([
      ...connection.customModels,
      ...(connection.withDefaultModels
        ? getConnectionDefaultModels(connection)
        : []),
    ]),
  );
}
