/** Sub-pages of `/organization/[organizationId]/ai-gateway`; `index` is Overview. */
export const GATEWAY_PAGE_SLUGS = {
  overview: "index",
  providers: "providers",
  models: "models",
  apiKeys: "api-keys",
} as const;

export type GatewayPageSlug =
  (typeof GATEWAY_PAGE_SLUGS)[keyof typeof GATEWAY_PAGE_SLUGS];
