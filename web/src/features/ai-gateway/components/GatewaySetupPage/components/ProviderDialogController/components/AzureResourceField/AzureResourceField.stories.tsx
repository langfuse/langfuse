import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { AzureResourceField } from "./AzureResourceField";

const meta = preview.meta({ component: AzureResourceField });

export const Default = meta.story({
  args: { value: "", isEditing: false, onChange: fn() },
});

export const Invalid = meta.story({
  args: {
    value: "https://my-resource.services.ai.azure.com",
    isEditing: false,
    onChange: fn(),
  },
});
