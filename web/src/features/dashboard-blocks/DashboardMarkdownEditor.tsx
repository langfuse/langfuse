import { useId, useState } from "react";
import { dashboardMarkdownConfigSchema } from "@langfuse/shared";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Label } from "@/src/components/ui/label";
import { DashboardMarkdown } from "./DashboardMarkdown";
import { DashboardBlockPlacement } from "./DashboardBlockPlacement";

type MarkdownConfig = { version: 1; title: string; content: string };
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
}: {
  initial: MarkdownConfig;
  beforePlacementId: string | null;
  placementOptions: { value: string | null; label: string }[];
  pending: boolean;
  error: string | undefined;
  onPlacementChange: (value: string | null) => void;
  onSave: (config: MarkdownConfig) => void;
  onCancel: () => void;
  onPreview: () => void;
}) {
  const [config, setConfig] = useState(initial);
  const [tab, setTab] = useState("write");
  const id = useId();
  const parsed = dashboardMarkdownConfigSchema.safeParse(config);
  const valid = parsed.success && config.content.trim().length > 0;
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
          disabled: !valid || pending,
          onClick: () => onSave(config),
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-title`}>Title (optional)</Label>
          <Input
            id={`${id}-title`}
            value={config.title}
            maxLength={255}
            disabled={pending}
            onChange={(event) =>
              setConfig({ ...config, title: event.target.value })
            }
            placeholder="Section title"
          />
        </div>
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
            <div className="flex flex-col gap-1.5 pt-3">
              <Label htmlFor={`${id}-content`}>Markdown content</Label>
              <Textarea
                id={`${id}-content`}
                value={config.content}
                disabled={pending}
                maxLength={100_000}
                rows={14}
                onChange={(event) =>
                  setConfig({ ...config, content: event.target.value })
                }
                placeholder="## What changed
Add context, links, or a decision for your team."
              />
              <p className="text-muted-foreground text-xs">
                Supports headings, lists, links, and tables. Raw HTML is not
                rendered.
              </p>
            </div>
          </Tabs.Content>
          <Tabs.Content value="preview">
            <div className="pt-3">
              <DashboardMarkdown
                title={config.title}
                content={config.content}
              />
            </div>
          </Tabs.Content>
        </Tabs>
        {!parsed.success && (
          <p role="alert" className="text-destructive text-sm">
            {parsed.error.issues[0]?.message}
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
