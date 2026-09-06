import { Button } from "@/src/components/ui/button";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  createOrganizationFormSchema,
  type organizationFormSchema,
} from "@/src/features/organizations/utils/organizationNameSchema";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

export const NewOrganizationForm = ({
  isLangfuseCloud,
  onSubmit,
}: {
  isLangfuseCloud: boolean;
  onSubmit: (values: z.infer<typeof organizationFormSchema>) => Promise<void>;
}) => {
  const t = useTranslations("workspace");
  const localizedFormSchema = createOrganizationFormSchema({
    noHtml: t("validation.noHtml"),
    minLength: t("validation.minLength"),
    maxLength: t("validation.maxLength"),
  });
  const form = useForm({
    resolver: zodResolver(localizedFormSchema),
    defaultValues: {
      name: "",
      aiFeaturesEnabled: true,
    },
  });

  async function handleSubmit(values: z.infer<typeof organizationFormSchema>) {
    try {
      await onSubmit(values);
      form.reset();
    } catch {
      form.setError("name", { message: t("organizationForm.createFailed") });
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-3"
        data-testid="new-org-form"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            form.handleSubmit(handleSubmit)();
          }
        }}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("organizationForm.name")}</FormLabel>
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
        <FormField
          control={form.control}
          name="aiFeaturesEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start justify-between gap-4 rounded-md border p-3">
              <div className="flex flex-col gap-1">
                <FormLabel>{t("organizationForm.enableAiFeatures")}</FormLabel>
                <p className="text-muted-foreground text-sm">
                  {isLangfuseCloud
                    ? t("organizationForm.cloudAiDescription")
                    : t("organizationForm.selfHostedAiDescription")}{" "}
                  {isLangfuseCloud && (
                    <a
                      href="https://langfuse.com/security/ai-features"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      {t("organizationForm.learnMore")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label={t("organizationForm.enableAiFeatures")}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t("organizationForm.create")}
        </Button>
      </form>
    </Form>
  );
};
