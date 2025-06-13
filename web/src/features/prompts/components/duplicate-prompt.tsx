import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { Copy } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { ActionButton } from "@/src/components/ActionButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/src/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { usePromptNameValidation } from "@/src/features/prompts/hooks/usePromptNameValidation";

enum CopySettings {
  SINGLE_VERSION = "single_version",
  ALL_VERSIONS = "all_versions",
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  isCopySingleVersion: z.enum(CopySettings),
});

const DuplicatePromptForm: React.FC<{
  projectId: string;
  promptId: string;
  promptName: string;
  promptVersion: number;
  onFormSuccess: () => void;
}> = ({ projectId, promptId, promptName, promptVersion, onFormSuccess }) => {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: promptName + "-copy",
      isCopySingleVersion: CopySettings.SINGLE_VERSION,
    },
  });

  const currentName = form.watch("name");

  const utils = api.useUtils();
  const duplicatePrompt = api.prompts.duplicatePrompt.useMutation({
    onSuccess: ({ name }) => {
      utils.prompts.invalidate();
      void router.push(
        `/project/${projectId}/prompts/${encodeURIComponent(name)}`,
      );
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    capture("prompt_detail:duplicate_form_submit");
    duplicatePrompt
      .mutateAsync({
        ...values,
        projectId: projectId,
        promptId: promptId,
        isSingleVersion:
          values.isCopySingleVersion === CopySettings.SINGLE_VERSION,
      })
      .then(() => {
        onFormSuccess();
        form.reset();
      })
      .catch((error: Error) => {
        console.error(error);
      });
  }

  const allPrompts = api.prompts.filterOptions.useQuery(
    {
      projectId: projectId,
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  ).data?.name;

  usePromptNameValidation({
    currentName,
    allPrompts,
    form,
  });

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex h-full flex-1 flex-col gap-4"
      >
        <DialogBody>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} type="text" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isCopySingleVersion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Settings</FormLabel>
                <FormControl>
                  <RadioGroup
                    {...field}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex flex-col space-y-1"
                  >
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={CopySettings.SINGLE_VERSION} />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Copy only version {promptVersion}
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={CopySettings.ALL_VERSIONS} />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Copy all prompt versions and labels
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            type="submit"
            loading={duplicatePrompt.isLoading}
            className="mt-auto w-full"
          >
            Submit
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};

export const DuplicatePromptButton: React.FC<{
  projectId: string;
  promptId: string;
  promptName: string;
  promptVersion: number;
}> = ({ projectId, promptId, promptName, promptVersion }) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });
  const promptLimit = useEntitlementLimit("prompt-management-count-prompts");
  const capture = usePostHogClientCapture();

  const allPromptNames = api.prompts.allNames.useQuery(
    {
      projectId,
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: hasAccess,
    },
  );

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ActionButton
          icon={<Copy className="h-4 w-4" aria-hidden="true" />}
          hasAccess={hasAccess}
          variant="outline"
          limit={promptLimit}
          title="Duplicate prompt"
          limitValue={allPromptNames.data?.length ?? undefined}
          onClick={() => {
            capture("prompt_detail:duplicate_button_click");
          }}
        >
          <span className="hidden md:ml-1 md:inline">Duplicate</span>
        </ActionButton>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] min-h-0">
        <DialogHeader>
          <DialogTitle>Duplicate prompt</DialogTitle>
        </DialogHeader>
        <DuplicatePromptForm
          projectId={projectId}
          promptId={promptId}
          promptName={promptName}
          promptVersion={promptVersion}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
