import { type Session } from "next-auth";
import { assertUnreachable, type SessionView } from "@langfuse/shared";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export function canManageSessionView({
  session,
  projectId,
  createdBy,
  ownership,
}: {
  session: Session | null;
  projectId: string;
  createdBy: string | null;
  ownership: SessionView["ownership"];
}) {
  if (!session?.user) return false;
  if (ownership === "PROJECT") {
    return hasProjectAccess({ session, projectId, scope: "SessionViews:CUD" });
  }
  if (ownership === "PRIVATE") {
    return (
      createdBy === session.user.id &&
      hasProjectAccess({
        session,
        projectId,
        scope: "TableViewPresets:CUD",
      })
    );
  }
  return assertUnreachable(ownership);
}
