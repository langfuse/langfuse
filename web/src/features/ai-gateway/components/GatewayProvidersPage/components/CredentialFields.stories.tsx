import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { CredentialFields } from "./CredentialFields";

const meta = preview.meta({ component: CredentialFields });

const callbacks = {
  onNameChange: fn(),
  onCredentialChange: fn(),
};

export const Default = meta.story({
  args: {
    name: "Production",
    nameError: null,
    credential: "",
    credentialPlaceholder: "Enter secret key",
    ...callbacks,
  },
});

export const DuplicateNameError = meta.story({
  args: {
    name: "Production",
    nameError: "A provider credential with this name already exists.",
    credential: "",
    credentialPlaceholder: "Enter secret key",
    ...callbacks,
  },
});
