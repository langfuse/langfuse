import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/app/design-system/legacy-primitives/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/app/design-system/legacy-primitives/form";
import { CodeMirrorEditor } from "@/src/app/components/editor/CodeMirrorEditor";
import { api } from "@/src/app/utils/api";
import {
  showSuccessToast,
  showErrorToast,
} from "@/src/app/shell/notifications";
import { getFormattedPayload } from "@/src/experiments/utils/format";
import { type Prisma } from "@langfuse/shared";
import { Spinner } from "@/src/app/design-system/Spinner/Spinner";

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
            "Trigger is disabled",
            "Enable the trigger in settings to run remote experiments.",
            {
              operation: "remote_experiment.trigger",
              errorOrigin: "backend",
              errorCategory: "product_state",
            },
            "WARNING",
          );
        } else if (data.success) {
          showSuccessToast({
            operation: "remote_experiment.trigger",
            title: "Remote experiment triggered",
            description:
              "Your remote experiment may take a few minutes to complete.",
          });
        } else {
          showErrorToast(
            "Failed to trigger remote experiment",
            data.error ||
              "Please try again or check your remote experiment configuration.",
            {
              operation: "remote_experiment.trigger",
              errorOrigin: "backend",
              errorCategory: "internal",
            },
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
          message: "Invalid JSON format",
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

  return (
    <>
      <DialogHeader>
        <Button
          variant="ghost"
          onClick={() => setShowTriggerModal(false)}
          className="inline-block self-start"
        >
          ← Back
        </Button>
        <DialogTitle>Run remote dataset run</DialogTitle>
        <DialogDescription>
          This action will send the following information to{" "}
          <strong>{remoteExperimentConfig.url}</strong>.
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
                    <FormLabel>Config</FormLabel>
                    <FormDescription>
                      Confirm the config you want to send to the remote dataset
                      run URL along with the{" "}
                      <strong>{dataset.data?.name}</strong> dataset information.
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
                Cancel
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
                Run
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
