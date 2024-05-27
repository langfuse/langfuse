import Link from "next/link";

import { Label } from "@/src/components/ui/label";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { supportedModels, type UIModelParams } from "@langfuse/shared";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";

export const LLMApiKeyComponent = (p: {
  projectId: string;
  modelParams: UIModelParams;
}) => {
  const hasAccess = useHasAccess({
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

  const model = p.modelParams.model.value;
  const modelProvider = Object.entries(supportedModels).find((providerData) =>
    (providerData[1] as any as string[]).includes(model),
  )?.[0];

  const apiKey = apiKeys.data?.data.find((k) => k.provider === modelProvider);

  return (
    <div className="space-y-2 text-xs">
      <Label className="text-xs font-semibold">API key</Label>
      <div>
        {apiKey ? (
          <span className="mr-2 rounded-sm bg-input p-1 text-xs">
            {apiKey.displaySecretKey}
          </span>
        ) : undefined}
      </div>
      {/* Custom form message to include a link to the already existing prompt */}
      {!apiKey ? (
        <div className="flex flex-col font-medium text-destructive">
          {`No LLM API key found for provider ${modelProvider}.`}

          <Link
            href={`/project/${p.projectId}/settings`}
            className="flex flex-row"
          >
            Create a new LLM API key here. <ArrowTopRightIcon />
          </Link>
        </div>
      ) : undefined}
      <p className="text-muted-foreground">
        The LLM API key is used for each execution and will incur costs.
      </p>
    </div>
  );
};
