import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { VersionUpdateBannerView } from "./VersionUpdateBannerView";

const meta = preview.meta({
  component: VersionUpdateBannerView,
  args: {
    onReload: fn(),
    onDismiss: fn(),
  },
});

/**
 * The banner only exists in its "a new version is available" state — it renders
 * nothing otherwise — so this default IS that state. It pins to the top of the
 * viewport (as in the app) and offers Reload plus a dismiss control.
 */
export const Default = meta.story({});
