import { expect, fn, userEvent, waitFor, within } from "storybook/test";

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

export const SelectsChannels = meta.story({
  name: "(Test) Selects channels and custom names",
  args: {
    channelsData: {
      channels: [...publicChannels, privateChannel],
      hasPrivateChannelAccess: true,
    },
    isLoading: false,
    hasError: false,
    isRefreshing: false,
    onChannelSelect: fn(),
    onRefresh: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("combobox");
    await userEvent.click(trigger);
    await userEvent.type(
      body.getByPlaceholderText("Search channels..."),
      "incident-response",
    );
    await userEvent.click(
      await body.findByRole("option", { name: "incident-response" }),
    );
    await expect(args.onChannelSelect).toHaveBeenCalledWith(privateChannel);
    await userEvent.click(trigger);
    const search = body.getByPlaceholderText("Search channels...");
    await expect(search).toHaveValue("");
    await userEvent.type(search, "#new-channel");
    await userEvent.click(
      await body.findByRole("option", { name: 'Use "new-channel"' }),
    );
    await expect(args.onChannelSelect).toHaveBeenCalledWith({
      id: "#new-channel",
      name: "new-channel",
      isPrivate: false,
      isMember: false,
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh channels" }),
    );
    await expect(args.onRefresh).toHaveBeenCalledOnce();
  },
});

export const LargeWorkspace = meta.story({
  name: "(Test) Virtualizes a large workspace with keyboard navigation",
  args: {
    channelsData: {
      channels: Array.from({ length: 5000 }, (_, index) => ({
        id: `C${index}`,
        name: `channel-${String(index).padStart(4, "0")}`,
        isPrivate: false,
        isMember: true,
      })),
      hasPrivateChannelAccess: true,
    },
    isLoading: false,
    hasError: false,
    isRefreshing: false,
    onChannelSelect: fn(),
    onRefresh: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole("combobox"));
    await body.findByRole("option", { name: "channel-0000" });
    await expect(body.getAllByRole("option").length).toBeLessThan(100);
    await userEvent.keyboard("{End}");
    await waitFor(() =>
      expect(
        body.getByRole("option", { name: "channel-4999" }),
      ).toHaveAttribute("aria-selected", "true"),
    );
    await userEvent.keyboard("{Enter}");
    await expect(args.onChannelSelect).toHaveBeenCalledWith(
      args.channelsData!.channels[4999],
    );
  },
});

export const LoadingWithResults = meta.story({
  name: "(Test) Keeps results available while loading",
  args: {
    channelsData: { channels: publicChannels, hasPrivateChannelAccess: true },
    isLoading: true,
    hasError: false,
    isRefreshing: false,
    onChannelSelect: fn(),
    onRefresh: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("button", { name: "Refresh channels" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("combobox"));
    await expect(body.getByRole("status")).toHaveTextContent(
      "Loading Slack channels",
    );
    await waitFor(() =>
      expect(body.getByRole("option", { name: "alerts" })).toBeVisible(),
    );
  },
});

export const FilteredChannels = meta.story({
  name: "(Test) Preserves channel filters and exact-name matching",
  args: {
    channelsData: {
      channels: [
        ...publicChannels,
        privateChannel,
        { id: "C03", name: "non-member", isPrivate: false, isMember: false },
      ],
      hasPrivateChannelAccess: true,
    },
    memberOnly: true,
    filterChannels: (channel) => channel.id !== "C02",
    isLoading: false,
    hasError: false,
    isRefreshing: false,
    onChannelSelect: fn(),
    onRefresh: fn(),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole("combobox"));
    await body.findByRole("option", { name: "alerts" });
    await expect(
      body.queryByRole("option", { name: "general" }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("option", { name: "non-member" }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      body.getByPlaceholderText("Search channels..."),
      "#ALERTS",
    );
    await expect(
      body.queryByRole("option", { name: 'Use "ALERTS"' }),
    ).not.toBeInTheDocument();
    await expect(body.getByRole("option", { name: "alerts" })).toBeVisible();
  },
});
