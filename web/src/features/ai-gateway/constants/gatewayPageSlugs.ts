/** Sub-pages of `/organization/[organizationId]/ai-gateway`; `index` is Overview. */
export const GATEWAY_PAGE_SLUGS = {
  overview: "index",
  models: "models",
  apiKeys: "api-keys",
} as const;

export type GatewayPageSlug =
  (typeof GATEWAY_PAGE_SLUGS)[keyof typeof GATEWAY_PAGE_SLUGS];

/** The former Providers page; it is now the Providers tab of Models. */
export const LEGACY_GATEWAY_PROVIDERS_SLUG = "providers";
