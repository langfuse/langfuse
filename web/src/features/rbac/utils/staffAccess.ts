import { type Role } from "@langfuse/shared/src/db";

type StaffUser =
  | { admin?: boolean; supportViewer?: boolean }
  | null
  | undefined;

// Admins and support viewers (active ConductorOne grant) can open orgs they are not a member of.
export const isStaff = (user: StaffUser): boolean =>
  user?.admin === true || user?.supportViewer === true;

// Admins are OWNER everywhere, members keep their role, support viewers are VIEWER elsewhere.
export function getEffectiveRole(
  user: StaffUser,
  memberRole: Role | undefined,
): Role | undefined {
  if (user?.admin === true) return "OWNER";
  if (memberRole) return memberRole;
  if (user?.supportViewer === true) return "VIEWER";
  return undefined;
}
