import preview from "../../../.storybook/preview";
import { PreviewDeploymentBannerView } from "./PreviewDeploymentBannerView";

const meta = preview.meta({
  component: PreviewDeploymentBannerView,
});

/**
 * The strip as it renders on a PR preview deployment: PR link, author, and
 * when the preview content was last updated. It pins to the top of the
 * viewport, as in the app.
 */
export const Default = meta.story({
  args: {
    prUrl: "https://github.com/langfuse/langfuse/pull/15580",
    prNumber: "15580",
    author: "nmtrang29",
    updatedText: "2 hours ago",
  },
});

/**
 * Author and timestamp are optional — the strip degrades to just the PR link,
 * and without a parseable PR number the link label falls back to a generic one.
 */
export const MinimalMetadata = meta.story({
  args: {
    prUrl: "https://github.com/langfuse/langfuse/pull/15580",
  },
});
