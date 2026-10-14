import { type Role } from "@langfuse/shared/src/db";

export const hasOwnRole = <T extends object>(
  p: T,
): p is Extract<T, { role: Role }> =>
  Object.prototype.hasOwnProperty.call(p, "role");
