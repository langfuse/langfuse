import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { AzureEndpointField } from "./AzureEndpointField";

const meta = preview.meta({ component: AzureEndpointField });

export const Default = meta.story({
  args: { value: "", isEditing: false, onChange: fn() },
});
