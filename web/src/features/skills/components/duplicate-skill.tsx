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
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/src/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { useSkillNameValidation } from "@/src/features/skills/hooks/useSkillNameValidation";

enum CopySettings {
  SINGLE_VERSION = "single_version",
  ALL_VERSIONS = "all_versions",
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  isCopySingleVersion: z.enum(CopySettings),
});

const DuplicateSkillForm: React.FC<{
  projectId: string;
  skillId: string;
  skillName: string;
  skillVersion: number;
  onFormSuccess: () => void;
}> = ({ projectId, skillId, skillName, skillVersion, onFormSuccess }) => {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: skillName + "-copy",
      isCopySingleVersion: CopySettings.SINGLE_VERSION,
    },
  });

  const currentName = form.watch("name");

  const utils = api.useUtils();
  const duplicateSkill = api.skills.duplicateSkill.useMutation({
    onSuccess: ({ name }) => {
      utils.skills.invalidate();
      router.push(`/project/${projectId}/skills/${encodeURIComponent(name)}`);
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    capture("skill_detail:duplicate_form_submit");
    duplicateSkill
      .mutateAsync({
        name: values.name,
        projectId: projectId,
        skillId: skillId,
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

  const allSkills = api.skills.filterOptions.useQuery(
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

  useSkillNameValidation({
    currentName,
    allSkills,
    form,
  });

  return (
    <Form {...form}>
      <form
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
                    <FormItem className="flex items-center space-y-0 space-x-3">
                      <FormControl>
                        <RadioGroupItem value={CopySettings.SINGLE_VERSION} />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Copy only version {skillVersion}
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-y-0 space-x-3">
                      <FormControl>
                        <RadioGroupItem value={CopySettings.ALL_VERSIONS} />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Copy all skill versions and labels
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
            loading={duplicateSkill.isPending}
            className="mt-auto w-full"
          >
            Submit
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};

export const DuplicateSkillButton: React.FC<{
  projectId: string;
  skillId: string;
  skillName: string;
  skillVersion: number;
}> = ({ projectId, skillId, skillName, skillVersion }) => {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "skills:CUD",
  });
  const capture = usePostHogClientCapture();

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ActionButton
          icon={<Copy className="h-4 w-4" aria-hidden="true" />}
          hasAccess={hasAccess}
          variant="outline"
          title="Duplicate skill"
          onClick={() => {
            capture("skill_detail:duplicate_button_click");
          }}
        >
          <span className="hidden md:ml-1 md:inline">Duplicate</span>
        </ActionButton>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] min-h-0">
        <DialogHeader>
          <DialogTitle>Duplicate skill</DialogTitle>
        </DialogHeader>
        <DuplicateSkillForm
          projectId={projectId}
          skillId={skillId}
          skillName={skillName}
          skillVersion={skillVersion}
          onFormSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
