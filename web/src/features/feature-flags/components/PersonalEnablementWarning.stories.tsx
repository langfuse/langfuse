import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { PersonalEnablementWarning } from "./PersonalEnablementWarning";

const meta = preview.meta({
  component: PersonalEnablementWarning,
});

export default meta;

export const WithPersonalLink = meta.story({
  args: {
    canOpenPersonalPreviews: true,
    onOpenPersonalPreviews: fn(),
  },
});

export const PersonalPreviewsUnavailable = meta.story({
  args: {
    canOpenPersonalPreviews: false,
    onOpenPersonalPreviews: fn(),
  },
});
