import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { ModelParameters } from "@/src/components/ModelParameters";
import { CardContent } from "@/src/components/ui/card";
import { Card } from "@/src/components/ui/card";
import { useModelParams } from "@/src/ee/features/playground/page/hooks/useModelParams";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useEvaluationModel } from "@/src/ee/features/evals/hooks/useEvaluationModel";
import { DeleteEvaluationModelButton } from "@/src/components/deleteButton";
import { ManageDefaultEvalModel } from "@/src/ee/features/evals/components/manage-default-eval-model";
import { useState } from "react";
import { DialogContent, DialogTrigger } from "@/src/components/ui/dialog";
import { Dialog } from "@/src/components/ui/dialog";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export default function DefaultEvaluationModelPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const utils = api.useUtils();
  const [isEditing, setIsEditing] = useState(false);

  const hasEntitlement = useHasEntitlement("model-based-evaluations");
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:read",
  });

  const hasLlmApiKeysReadAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:read",
  });

  const {
    modelParams,
    setModelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    availableProviders,
  } = useModelParams();

  const { selectedModel, isDefaultModelLoading } = useEvaluationModel(
    projectId,
    setModelParams,
  );

  const { data: llmApiKeys, isLoading: isLlmApiKeysLoading } =
    api.llmApiKey.all.useQuery(
      { projectId },
      { enabled: hasLlmApiKeysReadAccess },
    );

  const { mutate: upsertDefaultModel } =
    api.defaultLlmModel.upsertDefaultModel.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Default evaluation model updated",
          description: "All running evaluators will use the new model.",
        });

        utils.defaultLlmModel.fetchDefaultModel.invalidate({ projectId });
      },
    });

  if (isDefaultModelLoading || isLlmApiKeysLoading) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  if (!hasReadAccess || !hasEntitlement) {
    return <SupportOrUpgradePage />;
  }

  const hasLlmConnections = llmApiKeys && llmApiKeys.totalCount > 0;

  return (
    <>
      <Page
        withPadding
        headerProps={{
          title: "Default Evaluation Model",
          help: {
            description:
              "Configure a default evaluation model for your project.",
            href: "https://langfuse.com/docs/scores/model-based-evals",
          },
          breadcrumb: [
            {
              name: "Evaluator Library",
              href: `/project/${projectId}/evals/templates`,
            },
          ],
        }}
      >
        <Card className="mt-3 flex flex-col gap-6">
          <CardContent>
            <p className="my-2 text-lg font-semibold">Default model</p>
            <ManageDefaultEvalModel
              projectId={projectId}
              variant="color-coded"
              setUpMessage="No default model set. Set up default evaluation model"
              className="text-sm font-normal"
              showEditButton={false}
            />
            {!hasLlmConnections && (
              <div className="mt-4 flex items-center rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                <TriangleAlert className="mr-2 h-4 w-4 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">No LLM connections configured</p>
                  <p className="mt-1">
                    You need to add at least one LLM connection before you can
                    set up a default evaluation model.
                  </p>
                  <Button asChild disabled={!hasWriteAccess} className="mt-2">
                    <Link
                      href={`/project/${projectId}/settings?page=llm-connections`}
                    >
                      Add LLM Connection
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-2 flex justify-end gap-2">
          {selectedModel && (
            <DeleteEvaluationModelButton
              projectId={projectId}
              scope="evalDefaultModel:CUD"
            />
          )}

          {hasLlmConnections && (
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
              <DialogTrigger asChild>
                <Button
                  disabled={!hasWriteAccess || !modelParams.provider.value}
                  onClick={() => {
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {selectedModel ? "Edit" : "Set up"}
                </Button>
              </DialogTrigger>
              <DialogContent className="px-3 py-10">
                <ModelParameters
                  customHeader={
                    <p className="font-medium leading-none">
                      Default model configuration
                    </p>
                  }
                  {...{
                    modelParams,
                    availableModels,
                    availableProviders,
                    updateModelParamValue,
                    setModelParamEnabled,
                  }}
                  formDisabled={!hasWriteAccess}
                />
                <div className="my-2 text-xs text-muted-foreground">
                  Select a model which supports function calling.
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!hasWriteAccess || !modelParams.provider.value}
                    onClick={() => {
                      upsertDefaultModel({
                        projectId,
                        provider: modelParams.provider.value,
                        adapter: modelParams.adapter.value,
                        model: modelParams.model.value,
                        modelParams: {
                          max_tokens: modelParams.max_tokens.value,
                          temperature: modelParams.temperature.value,
                          top_p: modelParams.top_p.value,
                        },
                      });
                      setIsEditing(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </Page>
    </>
  );
}
