// Foundry resource names become the subdomain of the resource endpoint.
const RESOURCE_NAME = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
const RESOURCE_HOST =
  /^([a-z0-9][a-z0-9-]{0,62}[a-z0-9])\.services\.ai\.azure\.com$/;
// Kept to characters that need no escaping in the project path.
const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROJECT_PATH = /^\/api\/projects\/([^/]+)$/;

export type AzureResource = { name: string; project: string | null };

export function isAzureResourceName(name: string): boolean {
  return RESOURCE_NAME.test(name.trim().toLowerCase());
}

export function isAzureProjectName(project: string): boolean {
  return PROJECT_NAME.test(project.trim());
}

/**
 * The connection's base URL: the resource origin, followed by the project
 * whose deployments are listed when one is given.
 */
export function getAzureResourceEndpoint(resource: AzureResource): string {
  const origin = `https://${resource.name.trim().toLowerCase()}.services.ai.azure.com`;
  const project = resource.project?.trim();
  return project ? `${origin}/api/projects/${project}` : origin;
}

/** Returns null for anything but a Foundry resource or project endpoint. */
export function getAzureResource(baseURL: string): AzureResource | null {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    return null;
  }
  if (url.search || url.hash) return null;
  const name = RESOURCE_HOST.exec(url.hostname)?.[1];
  if (!name) return null;

  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === "") return { name, project: null };
  const project = PROJECT_PATH.exec(pathname)?.[1];
  return project && PROJECT_NAME.test(project) ? { name, project } : null;
}
