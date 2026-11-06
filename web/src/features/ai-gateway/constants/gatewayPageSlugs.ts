/** Sub-pages of `/organization/[organizationId]/ai-gateway`; `index` is Setup. */
export const GATEWAY_PAGE_SLUGS = {
  setup: "index",
  models: "models",
  apiKeys: "api-keys",
  analytics: "analytics",
} as const;

export type GatewayPageSlug =
  (typeof GATEWAY_PAGE_SLUGS)[keyof typeof GATEWAY_PAGE_SLUGS];
