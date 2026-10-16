import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { OrganizationFeaturePreviewIntro } from "./OrganizationFeaturePreviewIntro";

const meta = preview.meta({
  component: OrganizationFeaturePreviewIntro,
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
