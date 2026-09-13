import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogContent,
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
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { TriangleAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";

type TransferProjectDialogOrganization = {
  id: string;
  name: string;
};

export interface TransferProjectDialogContentProps {
  projectName: string;
  organizationName: string;
  organizations: TransferProjectDialogOrganization[];
  isPending: boolean;
  onConfirm: (organizationId: string) => void;
}

export function TransferProjectDialogContent({
  projectName,
  organizationName,
  organizations,
  isPending,
  onConfirm,
}: TransferProjectDialogContentProps) {
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
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Transfer Project</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(({ organizationId }) =>
            onConfirm(organizationId),
          )}
          className="flex flex-col gap-8"
        >
          <DialogBody>
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((organization) => (
                          <SelectItem
                            key={organization.id}
                            value={organization.id}
                          >
                            {organization.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
          </DialogBody>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              loading={isPending}
              className="w-full"
            >
              Transfer project
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
