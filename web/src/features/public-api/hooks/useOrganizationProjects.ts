import { useSession } from "next-auth/react";

/** ExampleProject is a project the API key examples can name. */
export type ExampleProject = { id: string; name: string };

/** useOrganizationProjects returns the organization's projects the user can read, sorted by name. */
export function useOrganizationProjects(orgId: string): ExampleProject[] {
  const session = useSession();
  const organization = session.data?.user?.organizations.find(
    (org) => org.id === orgId,
  );

  return (organization?.projects ?? [])
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
