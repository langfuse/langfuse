import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Form,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { ZodModelProvider } from "@/src/features/llm-api-key/types";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { zodResolver } from "@hookform/resolvers/zod";
import { ModelProvider } from "@langfuse/shared";
import { DialogDescription } from "@radix-ui/react-dialog";
import { PlusIcon, TrashIcon } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export function LlmApiKeyList(props: { projectId: string }) {
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "apiKeys:read",
  });

  const apiKeys = api.llmApiKey.all.useQuery(
    {
      projectId: props.projectId,
    },
    {
      enabled: hasAccess,
    },
  );

  if (!hasAccess) return null;

  return (
    <div>
      <Header title="LLM API keys" level="h3" />
      <Card className="mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden text-gray-900 md:table-cell">
                Created
              </TableHead>
              <TableHead className="hidden text-gray-900 md:table-cell">
                Name
              </TableHead>
              <TableHead className="hidden text-gray-900 md:table-cell">
                Provider
              </TableHead>
              <TableHead className="text-gray-900">Secret Key</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className="text-gray-500">
            {apiKeys.data?.data.map((apiKey) => (
              <TableRow key={apiKey.id} className="hover:bg-transparent">
                <TableCell className="hidden md:table-cell">
                  {apiKey.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell className="font-mono">{apiKey.name}</TableCell>
                <TableCell className="font-mono">{apiKey.provider}</TableCell>
                <TableCell className="font-mono">
                  {apiKey.displaySecretKey}
                </TableCell>
                <TableCell>
                  <DeleteApiKeyButton
                    projectId={props.projectId}
                    apiKeyId={apiKey.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <CreateLlmApiKeyComponent
        projectId={props.projectId}
        existingKeyNames={Array.from(
          new Set(apiKeys.data?.data.map((k) => k.name)) ?? [],
        )}
      />
    </div>
  );
}

// show dialog to let user confirm that this is a destructive action
function DeleteApiKeyButton(props: { projectId: string; apiKeyId: string }) {
  const posthog = usePostHog();
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "apiKeys:delete",
  });

  const utils = api.useUtils();
  const mutDeleteApiKey = api.llmApiKey.delete.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });
  const [open, setOpen] = useState(false);

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <TrashIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mb-5">Delete API key</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Are you sure you want to delete this API key? This action cannot be
          undone.
        </DialogDescription>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => {
              mutDeleteApiKey
                .mutateAsync({
                  projectId: props.projectId,
                  id: props.apiKeyId,
                })
                .then(() => {
                  posthog.capture("project_settings:api_key_delete");
                  setOpen(false);
                })
                .catch((error) => {
                  console.error(error);
                });
            }}
            loading={mutDeleteApiKey.isLoading}
          >
            Permanently delete
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const formSchema = z.object({
  name: z.string().min(1),
  secretKey: z.string().min(1),
  provider: ZodModelProvider,
});

export function CreateLlmApiKeyComponent(props: {
  projectId: string;
  existingKeyNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "apiKeys:create",
  });

  const utils = api.useUtils();
  const mutCreateLlmApiKey = api.llmApiKey.create.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      secretKey: "",
      provider: ModelProvider.OpenAI,
    },
  });

  if (!hasAccess) return null;

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (props.existingKeyNames.includes(form.watch("name"))) {
      form.setError("name", {
        message: "Name already exists. Please choose an unique name.",
      });
      return;
    }

    return mutCreateLlmApiKey
      .mutateAsync({
        projectId: props.projectId,
        name: values.name,
        secretKey: values.secretKey,
        provider: values.provider,
      })
      .then(() => {
        form.reset();
        setOpen(false);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" loading={mutCreateLlmApiKey.isLoading}>
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add new LLM Api key
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Store a LLM API Key</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              className={cn("flex flex-col gap-6")}
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="eval-key" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="secretKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input placeholder="sk-proj-...Uwj9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LLM Provider</FormLabel>
                    <Select
                      defaultValue={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as ModelProvider[number])
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a verified email to display" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ModelProvider).map((provider) => (
                          <SelectItem value={provider} key={provider}>
                            {provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                loading={form.formState.isSubmitting}
              >
                Create API key
              </Button>
              <FormMessage />
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
