import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { AzureResourceField } from "./AzureResourceField";

const meta = preview.meta({ component: AzureResourceField });

export const Default = meta.story({
  args: { value: { name: "", project: "" }, isEditing: false, onChange: fn() },
});

export const WithProject = meta.story({
  args: {
    value: { name: "my-resource", project: "my-project" },
    isEditing: true,
    onChange: fn(),
  },
});

export const Invalid = meta.story({
  args: {
    value: {
      name: "https://my-resource.services.ai.azure.com",
      project: "my project",
    },
    isEditing: false,
    onChange: fn(),
  },
});
