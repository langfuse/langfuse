import { api, type RouterInputs } from "@/src/utils/api";
import { useCanReadTraceMessages } from "@/src/features/traces/hooks/useCanReadTraceMessages";

export function useTraceMessagesTranscript(
  input: RouterInputs["events"]["transcriptByTraceId"],
  isPlaceholderData: boolean,
) {
  const { canReadTraceMessages, isRestricted } = useCanReadTraceMessages({
    projectId: input.projectId,
    isPublic: true,
  });
  const { data, isLoading, error } = api.events.transcriptByTraceId.useQuery(
    input,
    { staleTime: 60 * 1_000, enabled: canReadTraceMessages },
  );

  if (isRestricted)
    return { data: undefined, state: { type: "empty" as const } };
  if (isLoading || isPlaceholderData)
    return { data, state: { type: "loading" as const } };
  if (error) return { data, state: { type: "error" as const } };
  if (!data?.transcript) return { data, state: { type: "empty" as const } };
  return {
    data,
    state: {
      type: "transcript" as const,
      result: { state: "loaded" as const, ...data },
    },
  };
}
