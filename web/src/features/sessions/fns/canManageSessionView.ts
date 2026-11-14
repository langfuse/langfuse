import { type Session } from "next-auth";

import {
  getSessionProjectRole,
  getSessionUserId,
  hasSessionUser,
} from "@/src/features/auth/lib/sessionAccessors";

export function canManageSessionView({
  session,
  projectId,
  createdBy,
}: {
  session: Session | null;
  projectId: string;
  createdBy: string | null;
}) {
  if (!hasSessionUser(session)) return false;
  const role = getSessionProjectRole(session, projectId);
  return (
    createdBy === getSessionUserId(session) ||
    role === "OWNER" ||
    role === "ADMIN"
  );
}
