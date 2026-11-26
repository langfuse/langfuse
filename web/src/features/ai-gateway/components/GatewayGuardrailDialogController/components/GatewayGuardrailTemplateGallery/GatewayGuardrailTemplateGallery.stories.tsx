import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { GatewayGuardrailTemplate } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import {
  GatewayGuardrailTemplateGallery,
  type GatewayGuardrailTemplateGalleryTab,
} from "./GatewayGuardrailTemplateGallery";

function StoryGuardrailTemplateGallery({
  onSelectTemplate,
}: {
  onSelectTemplate: (template: GatewayGuardrailTemplate) => void;
}) {
  const [activeTab, setActiveTab] =
    useState<GatewayGuardrailTemplateGalleryTab>("built-in");
  const [selectedTemplate, setSelectedTemplate] =
    useState<GatewayGuardrailTemplate | null>(null);

  return (
    <DialogController
      initialState={() => true}
      renderDialog={() => (
        <Dialog
          title={selectedTemplate ? selectedTemplate.name : "Add a guardrail"}
          size={selectedTemplate?.external ? "md" : "lg"}
          closeOnInteractionOutside={selectedTemplate === null}
          back={
            selectedTemplate
              ? {
                  onClick: () => setSelectedTemplate(null),
                  label: "Back to guardrail types",
                }
              : undefined
          }
        >
          {selectedTemplate === null ? (
            <GatewayGuardrailTemplateGallery
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              onSelectTemplate={(template) => {
                onSelectTemplate(template);
                setSelectedTemplate(template);
              }}
            />
          ) : (
            <Dialog.Body>
              <p>Selected {selectedTemplate.name}</p>
            </Dialog.Body>
          )}
        </Dialog>
      )}
    >
      {() => null}
    </DialogController>
  );
}

const meta = preview.meta({
  component: StoryGuardrailTemplateGallery,
});

export const Default = meta.story({
  args: {
    onSelectTemplate: fn(),
  },
});

export const BackPreservesDialogAndTab = meta.story({
  name: "(Test) Back preserves dialog and tab",
  args: {
    onSelectTemplate: fn(),
  },
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("tab", { name: /Integrations/i }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Amazon Bedrock/i }),
    );

    await expect(within(document.body).getByRole("dialog")).toBe(dialog);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Back to guardrail types" }),
    );

    await expect(within(document.body).getByRole("dialog")).toBe(dialog);
    await expect(
      within(dialog).getByRole("tab", { name: /Integrations/i }),
    ).toHaveAttribute("data-state", "active");
  },
});
