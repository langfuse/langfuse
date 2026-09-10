import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";

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
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";

type DeleteProjectForm = {
  name: string;
};

export type DeleteProjectDialogProps =
  | {
      blocked: true;
      onOpenGatewaySettings: () => void;
    }
  | {
      blocked?: false;
      confirmMessage: string;
      isPending: boolean;
      onSubmit: () => void;
    };

export function DeleteProjectDialog(props: DeleteProjectDialogProps) {
  return props.blocked ? (
    <BlockedDeleteProjectDialog
      onOpenGatewaySettings={props.onOpenGatewaySettings}
    />
  ) : (
    <DeleteProjectConfirmationDialog {...props} />
  );
}

function BlockedDeleteProjectDialog({
  onOpenGatewaySettings,
}: {
  onOpenGatewaySettings: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold">
          Project cannot be deleted
        </DialogTitle>
        <DialogDescription>
          This project is used as the AI Gateway ingestion project. Select
          another ingestion project before deleting it.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button className="w-full" onClick={onOpenGatewaySettings}>
          Open AI Gateway settings
          <ExternalLink className="relative -top-px ml-1.5 size-3.5 shrink-0" />
        </Button>
      </DialogFooter>
    </>
  );
}

function DeleteProjectConfirmationDialog(props: {
  confirmMessage: string;
  isPending: boolean;
  onSubmit: () => void;
}) {
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
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold">Delete Project</DialogTitle>
        <DialogDescription>
          {`To confirm, type "${props.confirmMessage}" in the input box`}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(props.onSubmit)}>
          <DialogBody>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder={props.confirmMessage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              loading={props.isPending}
              className="w-full"
            >
              Delete project
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
