import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayGuardrailDialogShell } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailDialogShell/GatewayGuardrailDialogShell";
import { GatewayGuardrailTemplateGallery } from "./GatewayGuardrailTemplateGallery";

const meta = preview.meta({
  component: GatewayGuardrailTemplateGallery,
  decorators: [
    (Story) => (
      <DialogController
        initialState={() => true}
        renderDialog={() => (
          <GatewayGuardrailDialogShell size="4xl" closeOnInteractionOutside>
            <Story />
          </GatewayGuardrailDialogShell>
        )}
      >
        {() => null}
      </DialogController>
    ),
  ],
});

export const Default = meta.story({
  args: {
    onSelectTemplate: fn(),
  },
});
