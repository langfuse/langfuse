import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { renderV4BannerMessage } from "./topBannerContent";
import { V4MigrationTopBannerView } from "./V4MigrationTopBannerView";

const WARNING_MESSAGE =
  "{projects} still use legacy v3 ingestion, APIs and evals. They stop on Nov 16.";
const CRITICAL_MESSAGE =
  "Legacy v3 ingestion, APIs and evals are paused today 16:00 to 17:00 CET.";

const messageFor = (template: string) => renderV4BannerMessage(template, 3);

const meta = preview.meta({
  component: V4MigrationTopBannerView,
  args: {
    severity: "warning" as const,
    message: messageFor(WARNING_MESSAGE),
    showUpdate: true,
    onUpdateClick: fn(),
  },
});

/** Orange strip. The message is the warning env value. */
export const Warning = meta.story({});

/** Members cannot fix integrations, so they get the admin hint instead. */
export const WarningMember = meta.story({
  args: { showUpdate: false },
});

/** Red strip. The message is the critical env value. */
export const Critical = meta.story({
  args: {
    severity: "critical" as const,
    message: messageFor(CRITICAL_MESSAGE),
  },
});

export const CriticalMember = meta.story({
  args: {
    severity: "critical" as const,
    message: messageFor(CRITICAL_MESSAGE),
    showUpdate: false,
  },
});

export const AdminPrimaryAction = meta.story({
  name: "(Test) Inline update opens the panel",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Update" }));
    await expect(args.onUpdateClick).toHaveBeenCalled();
    await expect(
      canvas.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  },
});

export const MemberHint = meta.story({
  name: "(Test) Members see the admin hint instead of an update link",
  args: { showUpdate: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Update" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Ask an admin to update.")).toBeVisible();
  },
});

export const CriticalNotClosable = meta.story({
  name: "(Test) Critical banner has no close button",
  args: {
    severity: "critical" as const,
    message: messageFor(CRITICAL_MESSAGE),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Update" })).toBeVisible();
  },
});
