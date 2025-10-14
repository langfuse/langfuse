export type NormalizerContext = {
  metadata?: unknown;
  observationName?: string;
  framework?: string; // for explicit overrides
};

// Unified tool event representation across all providers
export type ToolEvent =
  | {
      type: "call";
      id?: string;
      name: string;
      argsJson: string; // Always JSON string for consistency
    }
  | {
      type: "result";
      id?: string;
      content: string; // Always string (stringify objects)
      status?: "ok" | "error";
    };

// Minimal provider adapter interface
export interface ProviderAdapter {
  id: string;
  detect(ctx: NormalizerContext): boolean;
  preprocess(
    data: unknown,
    kind: "input" | "output",
    ctx: NormalizerContext,
  ): unknown;
  extractToolEvents?(message: Record<string, unknown>): ToolEvent[];
}
