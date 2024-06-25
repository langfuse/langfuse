import { useSession } from "next-auth/react";

export function useLookBackDays(projectId: string) {
  const session = useSession();
  const lookBackDays =
    session.data?.environment.defaultTableDateTimeOffset ??
    session.data?.user?.projects.find((project) => project.id === projectId)
      ?.cloudConfig?.defaultLookBackDays ??
    7;
  return lookBackDays;
}
