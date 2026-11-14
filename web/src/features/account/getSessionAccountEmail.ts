import {
  getSessionUserEmail,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/** getSessionAccountEmail is the address the account settings show, empty while the session has none. */
export function getSessionAccountEmail(session: MaybeSession): string {
  return getSessionUserEmail(session) ?? "";
}
