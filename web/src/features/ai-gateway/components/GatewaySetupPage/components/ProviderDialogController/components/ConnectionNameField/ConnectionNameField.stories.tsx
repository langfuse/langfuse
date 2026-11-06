import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { ConnectionNameField } from "./ConnectionNameField";

const meta = preview.meta({ component: ConnectionNameField });

export const Default = meta.story({
  args: { name: "Production", nameError: null, onNameChange: fn() },
});

export const DuplicateNameError = meta.story({
  args: {
    name: "Production",
    nameError: "A provider credential with this name already exists.",
    onNameChange: fn(),
  },
});
