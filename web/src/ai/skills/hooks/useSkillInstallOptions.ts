import { api } from "@/src/app/utils/api";

export function useSkillInstallOptions(projectId: string, initialName: string) {
  const query = api.skills.filterOptions.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );
  const names = [
    ...new Set([
      ...(query.data?.names ?? []),
      ...(initialName ? [initialName] : []),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return { query, names };
}
