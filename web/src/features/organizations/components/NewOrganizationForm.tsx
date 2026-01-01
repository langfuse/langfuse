import { Button } from "@/src/components/ui/button";
import { useEffect } from "react";
import type * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { organizationFormSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { SurveyName } from "@prisma/client";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

export const NewOrganizationForm = ({
  onSuccess,
}: {
  onSuccess: (orgId: string) => void;
}) => {
  const { update: updateSession } = useSession();

  const form = useForm({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: {
      name: "",
      type: "Personal",
      size: undefined,
    },
  });
  const capture = usePostHogClientCapture();
  const createOrgMutation = api.organizations.create.useMutation({
    onError: (error) => form.setError("name", { message: error.message }),
  });
  const createSurveyMutation = api.surveys.create.useMutation();
  const watchedType = form.watch("type");
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  function onSubmit(values: z.infer<typeof organizationFormSchema>) {
    capture("organizations:new_form_submit");
    createOrgMutation
      .mutateAsync({
        name: values.name,
      })
      .then(async (org) => {
        // Submit survey with organization data only on Cloud and if type is provided
        if (isLangfuseCloud && values.type) {
          const surveyResponse: Record<string, string> = {
            type: values.type,
          };
          if (values.size) {
            surveyResponse.size = values.size;
          }

          try {
            await createSurveyMutation.mutateAsync({
              surveyName: SurveyName.ORG_ONBOARDING,
              response: surveyResponse,
              orgId: org.id,
            });
          } catch (error) {
            console.error("Failed to submit survey:", error);
            // Continue with organization creation even if survey fails
          }
        }

        void updateSession();
        onSuccess(org.id);
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  // Clear size whenever type is not Company or Agency to avoid submitting hidden values
  useEffect(() => {
    if (watchedType !== "Company" && watchedType !== "Agency") {
      form.setValue("size", undefined);
    }
  }, [watchedType, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        data-testid="new-org-form"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void form.handleSubmit(onSubmit)();
          }
        }}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization name</FormLabel>
              <FormControl>
                <Input
                  placeholder="my-org"
                  {...field}
                  data-testid="new-org-name-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isLangfuseCloud && (
          <>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <FormDescription>
                    What would best describe your organization?
                  </FormDescription>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger ref={field.ref}>
                        <SelectValue placeholder="Please choose" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Personal">Personal</SelectItem>
                      <SelectItem value="Educational">Educational</SelectItem>
                      <SelectItem value="Company">Company</SelectItem>
                      <SelectItem value="Startup">Startup</SelectItem>
                      <SelectItem value="Agency">Agency</SelectItem>
                      <SelectItem value="N/A">N/A</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(watchedType === "Company" || watchedType === "Agency") && (
              <FormField
                control={form.control}
                name="size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{watchedType} size</FormLabel>
                    <FormDescription>
                      How many people are in your {watchedType}?
                    </FormDescription>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger ref={field.ref}>
                          <SelectValue placeholder="Please choose" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1-10">1-10</SelectItem>
                        <SelectItem value="10-49">10-49</SelectItem>
                        <SelectItem value="50-99">50-99</SelectItem>
                        <SelectItem value="100-299">100-299</SelectItem>
                        <SelectItem value="More than 300">
                          More than 300
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>
        )}
        <Button type="submit" loading={createOrgMutation.isPending}>
          Create
        </Button>
      </form>
    </Form>
  );
};
