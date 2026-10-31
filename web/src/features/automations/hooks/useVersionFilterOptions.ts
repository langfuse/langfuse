import { TriggerEventSource } from "@langfuse/shared";
import { api } from "@/src/utils/api";

export function useVersionFilterOptions({
  projectId,
  eventSource,
  enabled,
}: {
  projectId: string;
  eventSource: TriggerEventSource;
  enabled: boolean;
}) {
  const isSkill = eventSource === TriggerEventSource.Skill;
  const promptOptions = api.prompts.filterOptions.useQuery(
    { projectId },
    { enabled: enabled && !isSkill },
  );
  const skillOptions = api.skills.filterOptions.useQuery(
    { projectId },
    { enabled: enabled && isSkill },
  );

  return {
    filterOptions: isSkill
      ? {
          labels: skillOptions.data?.labels.map((value) => ({ value })) ?? [],
          tags: skillOptions.data?.tags ?? [],
        }
      : promptOptions.data,
    isFetching: isSkill ? skillOptions.isFetching : promptOptions.isFetching,
  };
}
