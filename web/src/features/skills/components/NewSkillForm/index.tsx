import router from "next/router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type CreateSkillTRPCType,
  PRODUCTION_LABEL,
  type Skill,
  extractVariables,
  getIsCharOrUnderscore,
} from "@langfuse/shared";
import { ReviewSkillDialog } from "./ReviewSkillDialog";
import {
  NewSkillFormSchema,
  type NewSkillFormSchemaType,
  parseAllowedTools,
} from "./validation";
import { Input } from "@/src/components/ui/input";
import Link from "next/link";
import { SquareArrowOutUpRight } from "lucide-react";
import { SkillVariableListPreview } from "@/src/features/skills/components/SkillVariableListPreview";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryParam } from "use-query-params";
import { useSkillNameValidation } from "@/src/features/skills/hooks/useSkillNameValidation";

type NewSkillFormProps = {
  initialSkill?: Skill | null;
  onFormSuccess?: () => void;
};

export const NewSkillForm: React.FC<NewSkillFormProps> = (props) => {
  const { onFormSuccess, initialSkill } = props;
  const projectId = useProjectIdFromURL();
  const [folderPath] = useQueryParam("folder");
  const [formError, setFormError] = useState<string | null>(null);

  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  const defaultValues: NewSkillFormSchemaType = {
    name: initialSkill?.name ?? (folderPath ? `${folderPath}/` : ""),
    description: initialSkill?.description ?? "",
    instructions: initialSkill?.instructions ?? "",
    metadata: JSON.stringify(initialSkill?.metadata?.valueOf() ?? {}, null, 2),
    allowedTools: (initialSkill?.allowedTools ?? []).join(", "),
    isActive: !Boolean(initialSkill),
    commitMessage: undefined,
  };

  const form = useForm({
    resolver: zodResolver(NewSkillFormSchema),
    mode: "onTouched",
    defaultValues,
  });

  const currentName = form.watch("name");
  const currentExtractedVariables = extractVariables(
    form.watch("instructions"),
  ).filter(getIsCharOrUnderscore);

  const createSkillMutation = api.skills.create.useMutation({
    onSuccess: () => utils.skills.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  const allSkills = api.skills.filterOptions.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
    },
    {
      enabled: Boolean(projectId),
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  ).data?.name;

  function onSubmit(values: NewSkillFormSchemaType) {
    capture(
      initialSkill ? "skills:update_form_submit" : "skills:new_form_submit",
      {
        active: values.isActive,
        hasMetadata: values.metadata !== "{}",
        countVariables: currentExtractedVariables.length,
      },
    );

    if (!projectId) throw Error("Project ID is not defined.");

    const newSkill: CreateSkillTRPCType = {
      projectId,
      name: values.name,
      description: values.description,
      instructions: values.instructions,
      metadata: JSON.parse(values.metadata),
      allowedTools: parseAllowedTools(values.allowedTools),
      labels: values.isActive ? [PRODUCTION_LABEL] : [],
      commitMessage: values.commitMessage,
    };

    createSkillMutation
      .mutateAsync(newSkill)
      .then((newSkill) => {
        onFormSuccess?.();
        form.reset();
        if (newSkill && "name" in newSkill) {
          router.push(
            `/project/${projectId}/skills/${encodeURIComponent(newSkill.name)}`,
          );
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }

  useSkillNameValidation({
    currentName,
    allSkills,
    form,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        {/* Skill name field - only editable for new skills */}
        {!initialSkill ? (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => {
              const errorMessage = form.getFieldState("name").error?.message;

              return (
                <div>
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormDescription>
                      Use slashes &apos;/&apos; in skill names to organize them
                      into folders.
                    </FormDescription>
                    <FormControl>
                      <Input placeholder="Name your skill" {...field} />
                    </FormControl>
                    {/* Custom form message to include a link to the already existing skill */}
                    {form.getFieldState("name").error ? (
                      <div className="text-destructive flex flex-row space-x-1 text-sm font-medium">
                        <p className="text-destructive text-sm font-medium">
                          {errorMessage}
                        </p>
                        {errorMessage?.includes("already exist") ? (
                          <Link
                            href={`/project/${projectId}/skills/${currentName.trim()}`}
                            className="flex flex-row items-center"
                          >
                            Create a new version for it here.
                            <SquareArrowOutUpRight className="ml-1 h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </FormItem>
                </div>
              );
            }}
          />
        ) : null}

        {/* Description field */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormDescription>
                A short description of what this skill does and when to use it.
              </FormDescription>
              <FormControl>
                <Input placeholder="Describe your skill" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Instructions field */}
        <FormField
          control={form.control}
          name="instructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructions</FormLabel>
              <FormDescription>
                The instructions body of the skill. You can use{" "}
                <code className="text-xs">{"{{variable}}"}</code> to insert
                variables. Variables must be alphabetical characters or
                underscores.
              </FormDescription>
              <FormControl>
                <CodeMirrorEditor
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  editable
                  mode="text"
                  minHeight={200}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SkillVariableListPreview variables={currentExtractedVariables} />

        {/* Allowed tools field */}
        <FormField
          control={form.control}
          name="allowedTools"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Allowed tools</FormLabel>
              <FormDescription>
                Comma-separated list of tools this skill is allowed to use.
              </FormDescription>
              <FormControl>
                <Input placeholder="Read, Write, Bash" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Metadata field */}
        <FormField
          control={form.control}
          name="metadata"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Metadata</FormLabel>
              <FormDescription>
                Arbitrary JSON metadata that is available on the skill.
              </FormDescription>
              <CodeMirrorEditor
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                editable
                mode="json"
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Activate skill field */}
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-row items-center space-y-0 space-x-3 rounded-md border p-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Set the &quot;production&quot; label</FormLabel>
                </div>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="commitMessage"
          render={({ field }) => (
            <FormItem className="relative">
              <FormLabel>Commit message</FormLabel>
              <FormDescription>
                Provide information about the changes made in this version.
                Helps maintain a clear history of skill iterations.
              </FormDescription>
              <FormControl>
                <Textarea
                  placeholder="Add commit message..."
                  {...field}
                  value={field.value ?? ""}
                  className="rounded-md border text-sm focus:ring-0 focus:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {initialSkill ? (
          <div className="flex flex-col gap-2">
            <ReviewSkillDialog
              initialSkill={initialSkill}
              getNewSkillValues={form.getValues}
              isLoading={createSkillMutation.isPending}
              onConfirm={form.handleSubmit(onSubmit)}
            >
              <Button
                disabled={!form.formState.isValid}
                variant="secondary"
                className="w-full"
              >
                Review changes
              </Button>
            </ReviewSkillDialog>

            <Button
              type="submit"
              loading={createSkillMutation.isPending}
              className="w-full"
              disabled={!form.formState.isValid}
            >
              Save new skill version
            </Button>
          </div>
        ) : (
          <Button
            type="submit"
            loading={createSkillMutation.isPending}
            className="w-full"
            disabled={Boolean(
              !initialSkill && form.formState.errors.name?.message,
            )} // Disable button if skill name already exists. Check is dynamic and not part of zod schema
          >
            Create skill
          </Button>
        )}
      </form>
      {formError && (
        <p className="text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      )}
    </Form>
  );
};
