import Link from "next/link";

import { Label } from "@/src/components/ui/label";
import { api } from "@/src/utils/api";
import { type UIModelParams } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export const LLMApiKeyComponent = (p: {
  projectId: string;
  modelParams: UIModelParams;
}) => {
  const hasAccess = useHasProjectAccess({
    projectId: p.projectId,
    scope: "llmApiKeys:read",
  });

  if (!hasAccess) {
    return (
      <div>
        <Label className="text-xs font-semibold">API key</Label>
        <p className="text-sm text-muted-foreground">
          LLM API Key only visible to Owner and Admin roles.
        </p>
      </div>
    );
  }

  const apiKeys = api.llmApiKey.all.useQuery({
    projectId: p.projectId,
  });

  if (apiKeys.isLoading) {
    return (
      <div>
        <Label className="text-xs font-semibold">API key</Label>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const modelProvider = p.modelParams.provider.value;
  const apiKey = apiKeys.data?.data.find((k) => k.provider === modelProvider);

  return (
    <div className="space-y-2 text-xs">
      <Label className="text-xs font-semibold">API key</Label>
      <div>
        {apiKey ? (
          <Link href={`/project/${p.projectId}/settings/api-keys`}>
            <span className="mr-2 rounded-sm bg-input p-1 text-xs">
              {apiKey.displaySecretKey}
            </span>
          </Link>
        ) : undefined}
      </div>
    </div>
  );
};
