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
 * Cloud: retirement date included. Same amber tokens as the staff
 * customer-data strip; primary action enables v4, secondary opens migration
 * status.
 */
export const WithDeadline = meta.story({});

/** Self-hosted / no Cloud deadline — date clause omitted. */
export const WithoutDeadline = meta.story({
  args: { hasDeadline: false },
});

/** Primary CTA while the enable mutation / session refresh is in flight. */
export const Switching = meta.story({
  args: { isSwitching: true },
});

/**
 * Phone width: actions drop under the message (PaymentBanner pattern) so the
 * copy keeps the full row instead of squeezing beside non-wrapping buttons.
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
