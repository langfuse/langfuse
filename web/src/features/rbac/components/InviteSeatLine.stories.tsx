import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { InviteSeatLine } from "./InviteSeatLine";

/** A Hobby organization as its owner sees it, with `used` of `max` seats taken. */
const ownerSeats = (used: number, max: number) => ({
  used,
  max,
  planName: "Hobby",
  upgradePlanName: "Core",
  billingHref: "/organization/org-1/settings/billing",
});

/** The same organization for an admin, who can't upgrade. */
const adminSeats = (used: number, max: number) => ({
  ...ownerSeats(used, max),
  billingHref: undefined,
});

const meta = preview.meta({
  component: InviteSeatLine,
});

export const OwnerSeatsLeft = meta.story({
  args: {
    seatLimit: ownerSeats(1, 2),
    chipCount: 0,
    onBeforeOpenBilling: fn(),
  },
});

export const OwnerLastSeat = meta.story({
  args: {
    seatLimit: ownerSeats(1, 2),
    chipCount: 1,
    onBeforeOpenBilling: fn(),
  },
});

export const OwnerSeatsTaken = meta.story({
  args: {
    seatLimit: ownerSeats(2, 2),
    chipCount: 0,
    onBeforeOpenBilling: fn(),
  },
});

export const AdminSeatsTaken = meta.story({
  args: {
    seatLimit: adminSeats(2, 2),
    chipCount: 0,
    onBeforeOpenBilling: fn(),
  },
});
