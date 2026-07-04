import type { TelemetryOptions } from "ai";

export type AiSdkAdapterName =
  | "openai"
  | "openaiResponses"
  | "openaiChatCompletions";

export type AiSdkOpenAIApiMode = "responses" | "chat-completions";

export type AiSdkProviderMetadata = {
  adapter: "openai";
  apiMode: AiSdkOpenAIApiMode;
};

export type AiSdkProviderOptions = Record<string, Record<string, unknown>>;

export type AiSdkTelemetryScope = {
  run<T>(operation: () => T): T;
  end(error?: unknown): void;
};

export type AiSdkTelemetryContext = {
  telemetry?: TelemetryOptions;
  startScope(): AiSdkTelemetryScope;
  flushAndPublish(): Promise<void>;
};

export type AiSdkRootSpanAttributes = {
  adapter: "openai";
  apiMode: AiSdkOpenAIApiMode;
};
