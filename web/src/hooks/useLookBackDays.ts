import { useQueryProjectOrOrganization } from "@/src/features/projects/utils/useProject";
import { useSession } from "next-auth/react";

export function useLookBackDays() {
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const lookBackDays =
    session.data?.environment.defaultTableDateTimeOffset ??
    organization?.cloudConfig?.defaultLookBackDays ??
    7;
  return lookBackDays;
}
