import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";

type DeleteProjectForm = {
  name: string;
};

export type DeleteProjectDialogProps = {
  confirmMessage: string;
  isPending: boolean;
  onSubmit: () => void;
  /** Set when the project receives this organization's AI Gateway traces. */
  gatewayOrganizationName?: string;
};

export function DeleteProjectDialog(props: DeleteProjectDialogProps) {
  const formId = useId();
  const formSchema = z.object({
    name: z.string().includes(props.confirmMessage, {
      message: `Please confirm with "${props.confirmMessage}"`,
    }),
  });

  const form = useForm<DeleteProjectForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  return (
    <Dialog
      title="Delete Project"
      actions={[
        {
          label: "Delete project",
          type: "submit",
          form: formId,
          variant: "destructive",
          loading: props.isPending,
        },
      ]}
    >
      <Dialog.Body>
        <Form
          id={formId}
          actions={[]}
          onSubmit={(event) => {
            event.stopPropagation();
            return form.handleSubmit(props.onSubmit)(event);
          }}
        >
          {props.gatewayOrganizationName ? (
            <Banner variant="warning" title="This turns off the AI Gateway">
              {`This project receives the AI Gateway traces of ${props.gatewayOrganizationName}. Deleting it turns off the AI Gateway for the organization until you select a new ingestion project.`}
            </Banner>
          ) : null}
          <p>
            Deletion takes time and scales with project size. For very large
            projects, it can take multiple days. If deletion is slower than you
            expect, please reach out to support.
          </p>
          <p>{`To confirm, type "${props.confirmMessage}" in the input box`}</p>
          <Form.InputField
            control={form.control}
            name="name"
            label="Project name"
            placeholder={props.confirmMessage}
          />
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
