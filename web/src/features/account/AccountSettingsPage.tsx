import { useSession } from "next-auth/react";

import {
  getSessionAccountSettingsPages,
  type AccountSettingsPage,
} from "@/src/features/account/getSessionAccountSettingsPages";

/** useAccountSettingsPages lists the account settings pages for the signed-in user. */
export function useAccountSettingsPages(): AccountSettingsPage[] {
  const { data: session } = useSession();
  return getSessionAccountSettingsPages(session);
}
