import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** A row in the models dropdown; selecting it adds or removes `pattern`. */
export type GatewayModelPatternSuggestion =
  | { kind: "all-models"; pattern: null }
  | { kind: "connection"; pattern: string }
  | { kind: "model"; pattern: string; provider: GatewayProvider }
  | { kind: "typed-pattern"; pattern: string };
