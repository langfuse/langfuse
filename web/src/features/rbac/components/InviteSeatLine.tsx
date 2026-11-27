import { Banner } from "@/src/components/design-system/Banner/Banner";
import { getSeatState } from "@/src/features/rbac/fns/getSeatState";

export type InviteSeatLimit = {
  /** Members plus pending invitations: each holds a seat. */
  used: number;
  max: number;
  /** The plan's display name, e.g. "Hobby". */
  planName: string;
  /** The cheapest plan without a member limit, e.g. "Core". */
  upgradePlanName: string | undefined;
  /** Settings › Billing; set only for viewers who can upgrade. */
  billingHref: string | undefined;
};

type Tone = "neutral" | "warning" | "error";

type SeatLineCopy = {
  tone: Tone;
  text: string;
  /** For viewers who can upgrade: the link, and any words before it. */
  upgrade: { prompt?: string; link: string };
  /** For everyone else, in place of the link. */
  note?: string;
};

const countOpenSeats = (count: number) =>
  count === 1 ? "1 open seat" : `${count} open seats`;

const UNLIMITED_UPGRADE = "Upgrade for unlimited seats ↗";
const OWNER_CAN_UPGRADE = "An owner can upgrade for unlimited seats.";

function getSeatLineCopy(
  seatLimit: InviteSeatLimit,
  chipCount: number,
): SeatLineCopy {
  const { used, max, planName, upgradePlanName } = seatLimit;
  const openSeats = Math.max(0, max - used);
  // The same thresholds as the invite events' seatState, so copy and analytics agree.
  const seatState = getSeatState(seatLimit, chipCount);
  if (seatState === "full") {
    return {
      tone: "error",
      text: `Your ${max} ${planName} ${max === 1 ? "seat is" : "seats are"} taken.`,
      upgrade: {
        link: upgradePlanName
          ? `Upgrade to ${upgradePlanName} for unlimited seats ↗`
          : UNLIMITED_UPGRADE,
      },
      note: upgradePlanName
        ? `Ask an owner to upgrade to ${upgradePlanName}.`
        : "Ask an owner to upgrade.",
    };
  }
  if (chipCount === 0) {
    return {
      tone: "neutral",
      text: `You have ${countOpenSeats(openSeats)} on ${planName}.`,
      upgrade: { prompt: "Need more?", link: UNLIMITED_UPGRADE },
      note: OWNER_CAN_UPGRADE,
    };
  }
  if (seatState === "over") {
    return {
      tone: "error",
      text: `You have ${countOpenSeats(openSeats)}, so ${chipCount - openSeats} of these won't be sent.`,
      upgrade: { link: UNLIMITED_UPGRADE },
      note: "Ask an owner to upgrade.",
    };
  }
  if (seatState === "last") {
    return {
      tone: "warning",
      text:
        openSeats === 1
          ? "This uses your last seat."
          : `These use your last ${openSeats} seats.`,
      upgrade: { prompt: "Want more?", link: UNLIMITED_UPGRADE },
      note: OWNER_CAN_UPGRADE,
    };
  }
  return {
    tone: "neutral",
    text: `Uses ${chipCount} of ${openSeats} open seats.`,
    upgrade: { link: UNLIMITED_UPGRADE },
  };
}

/**
 * How the addresses fit a limited plan's open seats. Viewers who can upgrade
 * get a link to billing in a new tab; everyone else is told who can.
 */
export function InviteSeatLine({
  seatLimit,
  chipCount,
  onBeforeOpenBilling,
}: {
  seatLimit: InviteSeatLimit;
  chipCount: number;
  /** Called on the link's click, before the new tab opens. */
  onBeforeOpenBilling: () => void;
}) {
  const { tone, text, upgrade, note } = getSeatLineCopy(seatLimit, chipCount);
  const { billingHref } = seatLimit;

  return (
    <Banner
      variant={tone}
      actions={
        billingHref
          ? [
              {
                text: upgrade.link,
                // A new tab, so the chips are still here when the owner comes back.
                onClick: () => {
                  onBeforeOpenBilling();
                  window.open(billingHref, "_blank", "noopener");
                },
              },
            ]
          : undefined
      }
    >
      {billingHref
        ? [text, upgrade.prompt].filter(Boolean).join(" ")
        : [text, note].filter(Boolean).join(" ")}
    </Banner>
  );
}
