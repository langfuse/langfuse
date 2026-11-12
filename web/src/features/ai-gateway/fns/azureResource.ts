// Foundry resource names become the subdomain of the resource endpoint.
const RESOURCE_NAME = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
const RESOURCE_HOST =
  /^([a-z0-9][a-z0-9-]{0,62}[a-z0-9])\.services\.ai\.azure\.com$/;

export function isAzureResourceName(name: string): boolean {
  return RESOURCE_NAME.test(name.trim().toLowerCase());
}

export function getAzureResourceEndpoint(name: string): string {
  return `https://${name.trim().toLowerCase()}.services.ai.azure.com`;
}

/** Returns null for anything but the origin of a Foundry resource. */
export function getAzureResourceName(baseURL: string): string | null {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    return null;
  }
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return RESOURCE_HOST.exec(url.hostname)?.[1] ?? null;
}
