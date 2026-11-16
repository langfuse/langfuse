export const gatewayApiKeyExpirationOptions = [
  { value: "never", label: "Never", days: null },
  { value: "1d", label: "1 day", days: 1 },
  { value: "1w", label: "1 week", days: 7 },
  { value: "1y", label: "1 year", days: 365 },
  { value: "custom", label: "Custom", days: null },
] as const;

export type GatewayApiKeyExpirationPreset =
  (typeof gatewayApiKeyExpirationOptions)[number]["value"];
