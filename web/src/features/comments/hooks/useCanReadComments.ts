import { useSession } from "next-auth/react";
import { useHasProjectAccess } from "@/src/features/rbac";

export function useCanReadComments(projectId: string) {
  const session = useSession();
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  if (!hasReadAccess) return false;
  return session.status === "authenticated";
}
