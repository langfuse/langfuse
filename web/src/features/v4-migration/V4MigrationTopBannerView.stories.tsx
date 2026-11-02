import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { LEGACY_API_SHUTDOWN_SCHEDULE } from "@/src/features/public-api/server/legacyApiShutdownSchedule";
import {
  getV4MigrationTopBannerContent,
  type V4MigrationTopBannerPhase,
} from "./topBannerContent";
import { V4MigrationTopBannerView } from "./V4MigrationTopBannerView";

const [day1, day2] = LEGACY_API_SHUTDOWN_SCHEDULE.brownoutWindows;

const contentFor = (
  phase: V4MigrationTopBannerPhase,
  canManageIntegrations = true,
) =>
  getV4MigrationTopBannerContent({
    phase,
    state: {
      serverNow:
        phase === "brownout_active"
          ? new Date(day2!.startsAt.getTime() + 30 * 60 * 1000)
          : new Date(day1!.endsAt.getTime() + 18 * 60 * 60 * 1000),
      activeWindow: phase === "brownout_active" ? day2! : null,
      nextWindow: day2!,
    },
    actionNeededCount: 3,
    totalProjects: 8,
    canManageIntegrations,
  });

const meta = preview.meta({
  component: V4MigrationTopBannerView,
  args: {
    phase: "amber",
    content: contentFor("amber"),
    onPrimaryClick: fn(),
    onSecondaryClick: fn(),
    onClose: fn(),
  },
});

/** Until evaluators and exports stop: amber, closable for the browser session. */
export const Amber = meta.story({
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Review what to update" }),
    );
    await expect(args.onPrimaryClick).toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "Close" })).toBeVisible();
  },
});

/** Members cannot fix integrations, so they get the admin hint instead. */
export const AmberMember = meta.story({
  args: { content: contentFor("amber", false) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Review what to update" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText(/Ask an admin to update integrations\./),
    ).toBeVisible();
  },
});

/** Nov 16–18 outside a window: names the next window in the viewer's timezone. */
export const BrownoutDay = meta.story({
  args: {
    phase: "brownout_day",
    content: contentFor("brownout_day"),
    onClose: undefined,
  },
});

/** Inside a brownout window. Red phases are never closable. */
export const BrownoutActive = meta.story({
  args: {
    phase: "brownout_active",
    content: contentFor("brownout_active"),
    onClose: undefined,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  },
});

/** From the full cut on. */
export const Cut = meta.story({
  args: { phase: "cut", content: contentFor("cut"), onClose: undefined },
});
