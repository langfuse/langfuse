import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { type z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { dashboardMarkdownConfigSchema } from "@langfuse/shared/dashboards";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Form } from "@/src/components/design-system/Form/Form";
import { Textarea } from "@/src/components/ui/textarea";
import { DashboardMarkdown } from "./DashboardMarkdown";
import { DashboardBlockPlacement } from "./DashboardBlockPlacement";

const markdownFormSchema = dashboardMarkdownConfigSchema.refine(
  (config) => config.content.trim().length > 0,
  { path: ["content"], message: "Add Markdown content." },
);
type MarkdownConfig = z.infer<typeof dashboardMarkdownConfigSchema>;

export function DashboardMarkdownEditor({
  initial,
  beforePlacementId,
  placementOptions,
  pending,
  error,
  onPlacementChange,
  onSave,
  onCancel,
  onPreview,
  sharedWidget = false,
}: {
  initial: MarkdownConfig;
  sharedWidget?: boolean;
  beforePlacementId: string | null;
  placementOptions: { value: string | null; label: string }[];
  pending: boolean;
  error: string | undefined;
  onPlacementChange: (value: string | null) => void;
  onSave: (config: MarkdownConfig) => void;
  onCancel: () => void;
  onPreview: () => void;
}) {
  const form = useForm<
    z.input<typeof markdownFormSchema>,
    undefined,
    MarkdownConfig
  >({
    resolver: zodResolver(markdownFormSchema),
    defaultValues: initial,
    mode: "onChange",
  });
  const [title, content] = useWatch({
    control: form.control,
    name: ["title", "content"],
  });
  const [tab, setTab] = useState("write");
  const formId = useId();
  return (
    <Dialog
      title="Markdown"
      size="lg"
      noCapture
      hideCloseButton
      requireExplicitClose={pending}
      actions={[
        {
          label: "Cancel",
          variant: "secondary",
          disabled: pending,
          onClick: onCancel,
        },
        {
          label: "Save Markdown",
          loading: pending,
          disabled: !form.formState.isValid || pending,
          type: "submit",
          form: formId,
        },
      ]}
    >
      <Dialog.Body separators="both">
        <Form
          id={formId}
          actions={[]}
          density="compact"
          onSubmit={form.handleSubmit(onSave)}
        >
          <Form.InputField
            control={form.control}
            name="title"
            label="Title (optional)"
            maxLength={255}
            disabled={pending}
            placeholder="Section title"
          />
          {placementOptions.length > 1 && (
            <DashboardBlockPlacement
              value={beforePlacementId}
              options={placementOptions}
              disabled={pending}
              onChange={onPlacementChange}
            />
          )}
          <Tabs
            value={tab}
            onValueChange={(next) => {
              if (next === tab) return;
              if (next === "preview") onPreview();
              setTab(next);
            }}
          >
            <Tabs.List variant="underline">
              <Tabs.Trigger value="write" label="Write" />
              <Tabs.Trigger value="preview" label="Preview" />
            </Tabs.List>
            <Tabs.Content value="write">
              <div className="pt-3">
                <Form.Field
                  control={form.control}
                  name="content"
                  label="Markdown content"
                  description="Supports headings, lists, links, and tables. Raw HTML is not rendered."
                >
                  {(field) => (
                    <Textarea
                      id={field.id}
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-describedby={field.inputDescribedById}
                      aria-invalid={Boolean(field.error)}
                      disabled={pending}
                      maxLength={100_000}
                      rows={14}
                      placeholder={
                        "## What changed\nAdd context, links, or a decision for your team."
                      }
                    />
                  )}
                </Form.Field>
              </div>
            </Tabs.Content>
            <Tabs.Content value="preview">
              <div className="pt-3">
                <DashboardMarkdown title={title} content={content} />
              </div>
            </Tabs.Content>
          </Tabs>
        </Form>
        {sharedWidget && (
          <p className="text-muted-foreground text-sm">
            Changes apply wherever this widget is used.
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </Dialog.Body>
    </Dialog>
  );
}
