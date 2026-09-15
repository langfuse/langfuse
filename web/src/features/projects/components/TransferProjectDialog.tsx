import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { TriangleAlert } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

type TransferProjectDialogOrganization = {
  id: string;
  name: string;
};

export interface TransferProjectDialogProps {
  projectName: string;
  organizationName: string;
  organizations: TransferProjectDialogOrganization[];
  isPending: boolean;
  onConfirm: (organizationId: string) => void;
}

export function TransferProjectDialog({
  projectName,
  organizationName,
  organizations,
  isPending,
  onConfirm,
}: TransferProjectDialogProps) {
  const formId = useId();
  const confirmMessage = `${organizationName}/${projectName}`
    .replaceAll(" ", "-")
    .toLowerCase();
  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: `Please confirm with "${confirmMessage}"`,
    }),
    organizationId: z.string(),
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      organizationId: "",
    },
  });

  return (
    <Dialog
      title="Transfer Project"
      actions={[
        {
          label: "Transfer project",
          type: "submit",
          form: formId,
          variant: "destructive",
          loading: isPending,
        },
      ]}
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(({ organizationId }) =>
            onConfirm(organizationId),
          )}
        >
          <Dialog.Body>
            <Alert variant="warning" icon={TriangleAlert}>
              <Alert.Title>Warning</Alert.Title>
              <Alert.Description>
                Transferring the project will move it to a different
                organization:
                <ul className="list-disc pl-4">
                  <li>
                    Members who are not part of the new organization will lose
                    access.
                  </li>
                  <li>
                    The project remains fully operational as API keys, settings,
                    and data will remain unchanged. All features (e.g. tracing,
                    prompt management) will continue to work without
                    interruption.
                  </li>
                </ul>
              </Alert.Description>
            </Alert>
            <FormField
              control={form.control}
              name="organizationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select New Organization</FormLabel>
                  <FormControl>
                    <SelectInput
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                      placeholder="Select organization"
                      options={organizations.map((organization) => ({
                        value: organization.id,
                        label: organization.name,
                      }))}
                    />
                  </FormControl>
                  <FormDescription>
                    Transfer this project to another organization where you have
                    the ability to create projects.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm</FormLabel>
                  <FormControl>
                    <Input placeholder={confirmMessage} {...field} />
                  </FormControl>
                  <FormDescription>
                    {`To confirm, type "${confirmMessage}" in the input box `}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Dialog.Body>
        </form>
      </Form>
    </Dialog>
  );
}
