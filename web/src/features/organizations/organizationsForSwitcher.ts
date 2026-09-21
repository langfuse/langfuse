import { type Session } from "next-auth";

type SessionOrganization = NonNullable<
  Session["user"]
>["organizations"][number];

/**
 * Session organizations plus the current org when it is missing from the
 * session (Langfuse admins viewing a customer org they do not belong to).
 * Switcher menus can then list that org's projects and link back to its
 * overview.
 */
export function organizationsForSwitcher(
  sessionOrganizations: SessionOrganization[] | null | undefined,
  currentOrganization: SessionOrganization | null | undefined,
): SessionOrganization[] | null {
  if (sessionOrganizations == null) return null;
  if (!currentOrganization) return sessionOrganizations;
  if (sessionOrganizations.some((org) => org.id === currentOrganization.id)) {
    return sessionOrganizations;
  }
  return [currentOrganization, ...sessionOrganizations];
}
