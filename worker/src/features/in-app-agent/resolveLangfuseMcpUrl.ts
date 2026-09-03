/**
 * Derives the Langfuse MCP endpoint the in-app agent calls from the configured
 * base URLs, or returns null when neither is set.
 *
 * LANGFUSE_MCP_BASE_URL wins over NEXTAUTH_URL so a deployment can point the
 * worker at an internal address without redirecting NEXTAUTH_URL. The worker
 * also builds links for users out of NEXTAUTH_URL — batch export emails, Slack
 * notifications, blob storage integration settings, usage threshold emails — so
 * pointing that at a cluster-internal Service makes all of them unreachable.
 *
 * Web validates the Host header of MCP requests, so an internal hostname used
 * here must also be listed in LANGFUSE_MCP_ALLOWED_HOSTS on web.
 *
 * Kept free of env and error-type coupling so the precedence and URL
 * normalisation are directly testable.
 */
export function resolveLangfuseMcpUrl(params: {
  mcpBaseUrl?: string;
  nextAuthUrl?: string;
}): string | null {
  const configuredUrl = params.mcpBaseUrl ?? params.nextAuthUrl;

  if (!configuredUrl) {
    return null;
  }

  const baseUrl = new URL(configuredUrl.replace(/\/api\/auth\/?$/, ""));

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/api/public/mcp`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return baseUrl.toString();
}
