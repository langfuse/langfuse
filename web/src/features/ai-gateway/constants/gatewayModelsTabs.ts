/** Tabs of the AI Gateway Models page, kept in the `tab` query parameter. */
export const GATEWAY_MODELS_TABS = {
  providers: "providers",
  models: "models",
} as const;

export type GatewayModelsTab =
  (typeof GATEWAY_MODELS_TABS)[keyof typeof GATEWAY_MODELS_TABS];
