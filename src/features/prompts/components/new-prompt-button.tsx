import { Button } from "@/src/components/ui/button";
import { LockIcon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { DialogTrigger } from "@radix-ui/react-dialog";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  Form,
  FormDescription,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";

import { usePostHog } from "posthog-js/react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { AutocompleteInput } from "@/src/features/prompts/components/combo-box";
import { Textarea } from "@/src/components/ui/textarea";
import { Input } from "@/src/components/ui/input";
import { Checkbox } from "@/src/components/ui/checkbox";

export const NewPromptButton = (props: {
  projectId: string;
  datasetId?: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId: props.projectId,
    scope: "datasets:CUD",
  });

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className={props.className}
          disabled={!hasAccess}
        >
          {hasAccess ? (
            <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
          ) : (
            <LockIcon className="-ml-0.5 mr-1.5 h-3 w-3" aria-hidden="true" />
          )}
          New prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="mb-5">Create new prompt</DialogTitle>
        </DialogHeader>
        <NewPromptForm
          projectId={props.projectId}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

const formSchema = z.object({
  name: z.string().min(1, "Enter a name"),
  prompt: z.string().min(1, "Select a dataset"),
  isActive: z.boolean({
    required_error: "Enter whether the prompt should go live",
  }),
});

export const NewPromptForm = (props: {
  projectId: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isActive: false,
    },
  });

  const prompts = api.prompts.all.useQuery({
    projectId: props.projectId,
  });

  const utils = api.useUtils();

  const createPromptMutation = api.prompts.create.useMutation({
    onSuccess: () => utils.prompts.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  const comboboxOptions =
    prompts.data?.map((prompt) => {
      return { label: prompt.name, value: prompt.name };
    }) ?? [];

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("prompts:new_prompt_form_submit");

    createPromptMutation
      .mutateAsync({
        ...values,
        projectId: props.projectId,
        name: values.name,
        prompt: values.prompt,
        isActive: values.isActive,
      })
      .then(() => {
        props.onFormSuccess?.();
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }
  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              {/* <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a prompt name" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {prompts.data?.map((prompt) => (
                    <SelectItem value={prompt.name} key={prompt.id}>
                      {prompt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select> */}
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="prompt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prompt</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="min-h-[150px] flex-1 font-mono text-xs"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Activate prompt</FormLabel>
              </div>
            </FormItem>
          )}
        />
        {/* <div className="grid flex-1 content-stretch gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="input"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Input</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    className="min-h-[150px] flex-1 font-mono text-xs"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expectedOutput"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Expected output</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    className="min-h-[150px] flex-1 font-mono text-xs"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div> */}
        <Button
          type="submit"
          loading={createPromptMutation.isLoading}
          className="w-full"
        >
          Create prompt
        </Button>
      </form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </Form>
  );
};
