import { type Session } from "next-auth";

export function canManageSessionView({
  session,
  projectId,
  createdBy,
}: {
  session: Session | null;
  projectId: string;
  createdBy: string | null;
}) {
  if (!session?.user) return false;
  const role = session.user.organizations
    .flatMap((organization) => organization.projects)
    .find((project) => project.id === projectId)?.role;
  return createdBy === session.user.id || role === "OWNER" || role === "ADMIN";
}
