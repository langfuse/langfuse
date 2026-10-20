import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { ChannelSelectorView } from "./ChannelSelectorView";

const publicChannels = [
  { id: "C01", name: "alerts", isPrivate: false, isMember: true },
  { id: "C02", name: "general", isPrivate: false, isMember: true },
];
const privateChannel = {
  id: "G0123ABC",
  name: "incident-response",
  isPrivate: true,
  isMember: true,
};

const meta = preview.meta({
  component: ChannelSelectorView,
});

export default meta;

/**
 * The person who connected Slack sees the private channels they are a member
 * of, with a lock icon.
 */
export const PrivateChannelSelected = meta.story({
  args: {
    channelsData: {
      channels: [...publicChannels, privateChannel],
      hasPrivateChannelAccess: true,
    },
    isLoading: false,
    hasError: false,
    isRefreshing: false,
    selectedChannelId: privateChannel.id,
    onChannelSelect: fn(),
    onRefresh: fn(),
    onReauthenticate: fn(),
  },
});

/**
 * Anyone else editing an automation that posts to a private channel sees the
 * masked channel name the server returns.
 */
export const MaskedPrivateChannel = meta.story({
  args: {
    channelsData: {
      channels: publicChannels,
      hasPrivateChannelAccess: true,
    },
    isLoading: false,
    hasError: false,
    isRefreshing: false,
    selectedChannelId: privateChannel.id,
    selectedChannel: {
      id: privateChannel.id,
      name: "Private Channel (…ABC)",
      isPrivate: true,
    },
    onChannelSelect: fn(),
    onRefresh: fn(),
    onReauthenticate: fn(),
  },
});

/** Older installs lack the scope to read private channels at all. */
export const MissingPrivateChannelScope = meta.story({
  args: {
    channelsData: {
      channels: publicChannels,
      hasPrivateChannelAccess: false,
    },
    isLoading: false,
    hasError: false,
    isRefreshing: false,
    onChannelSelect: fn(),
    onRefresh: fn(),
    onReauthenticate: fn(),
  },
});

export const ReauthenticatesForPrivateChannels = meta.story({
  name: "(Test) Re-authenticates for private channels",
  args: {
    channelsData: {
      channels: publicChannels,
      hasPrivateChannelAccess: false,
    },
    isLoading: false,
    hasError: false,
    isRefreshing: false,
    onChannelSelect: fn(),
    onRefresh: fn(),
    onReauthenticate: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", {
        name: "re-authenticate your Slack integration",
      }),
    );

    await expect(args.onReauthenticate).toHaveBeenCalledOnce();
  },
});
