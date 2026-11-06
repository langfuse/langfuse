const STORAGE_KEY = "langfuse-last-organization-id";

function readLastUsedOrganizationId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLastUsedOrganizationId(organizationId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, organizationId);
  } catch {
    // Storage can be blocked; landing then falls back to the first org.
  }
}

/** The org `/` opens: the last one visited if still a member, else the first non-demo org. */
export function pickLandingOrganizationId(
  organizations: { id: string }[],
  demoOrganizationId: string | undefined,
): string | undefined {
  const lastUsed = readLastUsedOrganizationId();
  if (lastUsed && organizations.some((org) => org.id === lastUsed)) {
    return lastUsed;
  }
  return organizations.find((org) => org.id !== demoOrganizationId)?.id;
}
