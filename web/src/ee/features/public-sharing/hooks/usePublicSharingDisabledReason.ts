import { useSession } from "next-auth/react";

/** Why traces and sessions in this project cannot be shared, or null when they can. */
export function usePublicSharingDisabledReason(
  projectId: string,
): string | null {
  const { data: session } = useSession();
  if (session?.environment.publicSharingDisabledByInstance) {
    return "Public sharing is disabled on this instance by your administrator.";
  }
  const organization = session?.user?.organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );
  if (organization?.publicSharingDisabled) {
    return "Public sharing is disabled for this organization.";
  }
  return null;
}
