import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { LegacyUiBannerView } from "./LegacyUiBannerView";

const meta = preview.meta({
  component: LegacyUiBannerView,
  args: {
    hasDeadline: true,
    isSwitching: false,
    onSwitchToLatestUi: fn(),
    onMigrationStatusClick: fn(),
  },
});

/**
 * Cloud: retirement date plus inline why-link on the left; enable CTA alone
 * on the right.
 */
export const WithDeadline = meta.story({});

/** Off-Cloud: lead + why-link only (no retirement sentence). */
export const WithoutDeadline = meta.story({
  args: { hasDeadline: false },
});

/** Enable CTA while the mutation / session refresh is in flight. */
export const Switching = meta.story({
  args: { isSwitching: true },
});

/**
 * Phone width: CTA drops under the message (PaymentBanner pattern).
 */
export const Narrow = meta.story({
  globals: { viewport: { value: "legacy-ui-banner-phone", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        "legacy-ui-banner-phone": {
          name: "Phone",
          styles: { width: "390px", height: "844px" },
        },
      },
    },
  },
});
