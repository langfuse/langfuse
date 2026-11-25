import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayGuardrailTemplateGallery } from "./GatewayGuardrailTemplateGallery";

const meta = preview.meta({
  component: GatewayGuardrailTemplateGallery,
  decorators: [
    (Story) => (
      <DialogController
        initialState={() => true}
        renderDialog={() => <Story />}
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
