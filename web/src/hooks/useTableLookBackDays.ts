import { useQueryProjectAndOrganization } from "@/src/features/projects/utils/useProject";
import { useSession } from "next-auth/react";

export function useTableLookBackDays() {
  const session = useSession();
  const { organization } = useQueryProjectAndOrganization();
  const lookBackDays =
    session.data?.environment.defaultTableDateTimeOffset ??
    organization?.cloudConfig?.defaultLookBackDays ??
    7;
  return lookBackDays;
}
