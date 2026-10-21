import { useId, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { DEFAULT_GATEWAY_INGESTION_PROJECT_NAME } from "@/src/features/ai-gateway/constants/gatewayConfig";
import type { GatewayIngestionMode } from "@langfuse/shared";

const createIngestionProjectSchema = z.object({
  projectName: z.string().trim().min(1, "Enter a project name."),
});

export type CreateIngestionProjectDialogControllerProps = {
  ingestionMode: GatewayIngestionMode;
  isSaving: boolean;
  onCreate: (values: {
    projectName: string;
    ingestionMode: GatewayIngestionMode;
  }) => void | Promise<void>;
  children: (control: { openDialog: () => void }) => ReactNode;
};

export function CreateIngestionProjectDialogController({
  ingestionMode,
  isSaving,
  onCreate,
  children,
}: CreateIngestionProjectDialogControllerProps) {
  function handleBeforeClose() {
    return !isSaving;
  }

  return (
    <DialogController
      onBeforeClose={handleBeforeClose}
      renderDialog={() => (
        <CreateIngestionProjectDialog
          ingestionMode={ingestionMode}
          isSaving={isSaving}
          onCreate={onCreate}
        />
      )}
    >
      {children}
    </DialogController>
  );
}

function CreateIngestionProjectDialog({
  ingestionMode,
  isSaving,
  onCreate,
}: Omit<CreateIngestionProjectDialogControllerProps, "children">) {
  const formId = useId();
  const form = useForm<CreateIngestionProjectValues>({
    resolver: zodResolver(createIngestionProjectSchema),
    defaultValues: { projectName: DEFAULT_GATEWAY_INGESTION_PROJECT_NAME },
  });

  function handleSubmit({ projectName }: CreateIngestionProjectValues) {
    return onCreate({ projectName, ingestionMode });
  }

  return (
    <Dialog
      title="Create ingestion project"
      actions={[
        {
          label: "Create project",
          type: "submit",
          form: formId,
          loading: isSaving,
          disabled: isSaving,
        },
      ]}
    >
      <form id={formId} onSubmit={form.handleSubmit(handleSubmit)}>
        <Dialog.Body>
          <FormField
            control={form.control}
            name="projectName"
            label="Project name"
            description="Project access follows organization roles and can be restricted in project settings."
          >
            {({ error, id, inputDescribedById, ...field }) => (
              <div className="ph-no-capture">
                <Input
                  id={id}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  error={error !== undefined}
                  aria-describedby={inputDescribedById}
                />
              </div>
            )}
          </FormField>
        </Dialog.Body>
      </form>
    </Dialog>
  );
}

type CreateIngestionProjectValues = z.infer<
  typeof createIngestionProjectSchema
>;
