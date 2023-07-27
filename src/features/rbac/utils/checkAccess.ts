import {
  roleAccessRights,
  type Scope,
} from "@/src/features/rbac/constants/roleAccessRights";
import { type MembershipRole } from "@prisma/client";
import { type Session } from "next-auth";
import { type SessionContextValue } from "next-auth/react";

type HasAccessParams =
  | {
      role: MembershipRole;
      scope: Scope;
    }
  | {
      session: SessionContextValue | Session;
      projectId: string;
      scope: Scope;
    };

export const throwIfNoAccess = (p: HasAccessParams) => {
  if (!hasAccess(p)) throw new Error("No access");
};

export function hasAccess(p: HasAccessParams): boolean {
  const role: MembershipRole | undefined =
    "role" in p
      ? // MembershipRole
        p.role
      : "data" in p.session
      ? // SessionContextValue
        p.session.data?.user?.projects.find(
          (project) => project.id === p.projectId
        )?.role
      : // Session
        p.session.user?.projects.find((project) => project.id === p.projectId)
          ?.role;
  if (role === undefined) return false;

  return roleAccessRights[role].includes(p.scope);
}
