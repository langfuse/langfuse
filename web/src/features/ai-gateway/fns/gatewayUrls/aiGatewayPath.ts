export type AiGatewayPageSlug = "setup" | "models" | "keys" | "analytics";

export function aiGatewayPath(
  organizationId: string,
  slug: AiGatewayPageSlug = "setup",
) {
  const base = `/organization/${encodeURIComponent(organizationId)}/ai-gateway`;
  return slug === "setup" ? base : `${base}/${slug}`;
}
