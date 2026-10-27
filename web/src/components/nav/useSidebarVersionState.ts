import { type SidebarVersionState } from "@/src/components/nav/versionState";
import { usePlan } from "@/src/features/entitlements";
import { api } from "@/src/utils/api";

/** Release, plan, and background-migration status shown next to the logo. */
export function useSidebarVersionState({
  isLangfuseCloud,
}: {
  isLangfuseCloud: boolean;
}): SidebarVersionState {
  const plan = usePlan();

  const backgroundMigrationStatus = api.backgroundMigrations.status.useQuery(
    undefined,
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !isLangfuseCloud,
      throwOnError: false,
    },
  );

  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !isLangfuseCloud,
    throwOnError: false,
  });

  if (isLangfuseCloud) return { deployment: "cloud" };

  const selfHostedPlan =
    plan === "self-hosted:pro" ||
    plan === "self-hosted:enterprise" ||
    plan === "self-hosted:gov"
      ? plan
      : "oss";

  return {
    deployment: "self-hosted",
    plan: selfHostedPlan,
    release: checkUpdate.data?.updateType
      ? {
          status: "update-available",
          updateType: checkUpdate.data.updateType,
          latestRelease: checkUpdate.data.latestRelease,
        }
      : { status: "current" },
    migration:
      backgroundMigrationStatus.data &&
      backgroundMigrationStatus.data.status !== "FINISHED"
        ? {
            status: "in-progress",
            phase: backgroundMigrationStatus.data.status.toLowerCase(),
          }
        : { status: "idle" },
  };
}
