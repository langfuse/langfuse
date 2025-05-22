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

export default function DefaultEvaluationModelPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const utils = api.useUtils();

  const hasEntitlement = useHasEntitlement("model-based-evaluations");
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:read",
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

  if (isDefaultModelLoading) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  if (!hasReadAccess || !hasEntitlement) {
    return <SupportOrUpgradePage />;
  }

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
        {selectedModel ? (
          <div className="flex flex-col gap-6">
            <Card className="border-dark-green bg-light-green">
              <CardContent className="flex flex-col gap-1">
                <p className="mt-2 text-sm font-semibold">
                  Default evaluation model selected
                </p>
                <p className="text-xs text-muted-foreground">
                  This project will use the default evaluation model:
                  <span className="font-medium">
                    {" "}
                    {selectedModel.provider} / {selectedModel.model}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <Card className="border-dark-yellow bg-light-yellow">
              <CardContent className="flex flex-col gap-1">
                <p className="mt-2 text-sm font-semibold">
                  No default evaluation model selected
                </p>
                <p className="text-xs text-muted-foreground">
                  Select a model to use as the default evaluation model for your
                  project.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        <Card className="mt-3 flex flex-col gap-6">
          <CardContent>
            <ModelParameters
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
          </CardContent>
        </Card>
        {selectedModel ? (
          <div className="mt-2 flex justify-end gap-2">
            <DeleteEvaluationModelButton
              projectId={projectId}
              scope="evalDefaultModel:CUD"
            />
            <Button
              disabled={!hasWriteAccess}
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
              }}
            >
              Update as default
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex justify-end">
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
              }}
            >
              Set as default
            </Button>
          </div>
        )}
      </Page>
    </>
  );
}
