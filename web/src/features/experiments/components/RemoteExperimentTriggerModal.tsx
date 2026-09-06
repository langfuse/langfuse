import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { getFormattedPayload } from "@/src/features/experiments/utils/format";
import { type Prisma } from "@langfuse/shared";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useTranslations } from "next-intl";

const RemoteExperimentTriggerSchema = z.object({
  payload: z.string(),
});

type RemoteExperimentTriggerForm = z.infer<
  typeof RemoteExperimentTriggerSchema
>;

export const RemoteExperimentTriggerModal = ({
  projectId,
  datasetId,
  remoteExperimentConfig,
  setShowTriggerModal,
}: {
  projectId: string;
  datasetId: string;
  remoteExperimentConfig: {
    url: string;
    payload?: Prisma.JsonValue;
  };
  setShowTriggerModal: (show: boolean) => void;
}) => {
  const t = useTranslations("evaluationAnalytics.experiments");
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  const dataset = api.datasets.byId.useQuery({
    projectId,
    datasetId,
  });

  const form = useForm<RemoteExperimentTriggerForm>({
    resolver: zodResolver(RemoteExperimentTriggerSchema),
    defaultValues: {
      payload: getFormattedPayload(remoteExperimentConfig.payload),
    },
  });

  const runRemoteExperimentMutation =
    api.datasets.triggerRemoteExperiment.useMutation({
      onSuccess: (data) => {
        if (data.success && data.skipped) {
          showErrorToast(
            t("remote.triggerDisabled"),
            t("remote.enableTriggerToRun"),
            "WARNING",
          );
        } else if (data.success) {
          showSuccessToast({
            title: t("remote.triggered"),
            description: t("remote.triggeredDescription"),
          });
        } else {
          showErrorToast(
            t("remote.triggerFailed"),
            data.error || t("remote.triggerFailedDescription"),
          );
        }
        setShowTriggerModal(false);
      },
    });

  const onSubmit = (data: RemoteExperimentTriggerForm) => {
    if (data.payload.trim()) {
      try {
        JSON.parse(data.payload);
      } catch {
        form.setError("payload", {
          message: t("remote.invalidJson"),
        });
        return;
      }
    }

    runRemoteExperimentMutation.mutate({
      projectId,
      datasetId,
      payload: data.payload,
    });
  };

  if (!hasDatasetAccess) {
    return null;
  }

  return (
    <>
      <DialogHeader>
        <Button
          variant="ghost"
          onClick={() => setShowTriggerModal(false)}
          className="inline-block self-start"
        >
          {t("common.back")}
        </Button>
        <DialogTitle>{t("remote.runRemoteDatasetRun")}</DialogTitle>
        <DialogDescription>
          {t.rich("remote.sendInformationTo", {
            url: () => <strong>{remoteExperimentConfig.url}</strong>,
          })}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DialogBody>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="payload"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("remote.config")}</FormLabel>
                    <FormDescription>
                      {t.rich("remote.confirmConfigDescription", {
                        dataset: () => <strong>{dataset.data?.name}</strong>,
                      })}
                    </FormDescription>
                    <FormControl>
                      <CodeMirrorEditor
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        editable
                        mode="json"
                        minHeight={200}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <div className="flex w-full justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTriggerModal(false)}
                disabled={runRemoteExperimentMutation.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={runRemoteExperimentMutation.isPending}
              >
                {runRemoteExperimentMutation.isPending && (
                  <div className="mr-2">
                    <Spinner size="sm" />
                  </div>
                )}
                {t("common.run")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
