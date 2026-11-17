import { api } from "@/src/utils/api";

/** Pass `null` outside a project scope; the query then stays idle. */
export function useBedrockIamRoleAuth(projectId: string | null) {
  return api.llmApiKey.bedrockIamRoleAuth.useQuery(
    { projectId: projectId ?? "" },
    { enabled: projectId !== null },
  );
}
