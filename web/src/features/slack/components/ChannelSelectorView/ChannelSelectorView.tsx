import React, { useState, useMemo, useCallback, useEffect } from "react";
import { RefreshCw, Search, Hash, Lock, AlertTriangle } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type SlackChannel } from "@langfuse/shared/src/server";
const ITEM_HEIGHT = 32;

export interface ChannelSelectorViewProps {
  /** Loaded channels and private channel flags; null until the first page loads */
  channelsData: {
    channels: SlackChannel[];
    /** False when the bot token lacks the scope to read private channels */
    hasPrivateChannelAccess: boolean;
  } | null;
  isLoading: boolean;
  hasError: boolean;
  isRefreshing: boolean;
  /** Currently selected channel ID */
  selectedChannelId?: string;
  /** Full channel object for display when the ID isn't in the fetched list (e.g. manual entry) */
  selectedChannel?: SlackChannel | null;
  /** Callback when a channel is selected */
  onChannelSelect: (channel: SlackChannel) => void;
  onRefresh: () => void;
  /** Reconnects Slack to grant missing scopes */
  onReauthenticate: () => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Placeholder text for the selector */
  placeholder?: string;
  /** Whether to show only channels the bot is a member of */
  memberOnly?: boolean;
  /** Custom filter function for channels */
  filterChannels?: (channel: SlackChannel) => boolean;
  /** Whether to show the refresh button */
  showRefreshButton?: boolean;
}

/**
 * A command palette style dropdown for picking a Slack channel, with search,
 * public/private indicators, typed-name entry and private channel notices.
 * Items are virtualized with @tanstack/react-virtual to handle large channel lists (~5k).
 */
export const ChannelSelectorView: React.FC<ChannelSelectorViewProps> = ({
  channelsData,
  isLoading,
  hasError,
  isRefreshing,
  selectedChannelId,
  selectedChannel: selectedChannelProp,
  onChannelSelect,
  onRefresh,
  onReauthenticate,
  disabled = false,
  placeholder = "Select a channel",
  memberOnly = false,
  filterChannels,
  showRefreshButton = true,
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const trimmedSearch = searchValue.trim();
  const effectiveName = trimmedSearch.replace(/^#/, "");

  // Filter and search channels
  const filteredChannels = useMemo(() => {
    if (!channelsData?.channels) return [];

    let channels = channelsData.channels;

    // Apply member filter if requested
    if (memberOnly) {
      channels = channels.filter((channel) => channel.isMember);
    }

    // Apply custom filter if provided
    if (filterChannels) {
      channels = channels.filter(filterChannels);
    }

    // Apply search filter
    if (effectiveName) {
      const searchTerm = effectiveName.toLowerCase();
      channels = channels.filter((channel) =>
        channel.name.toLowerCase().includes(searchTerm),
      );
    }

    // Sort channels: public channels first, then private, then by name
    return [...channels].sort((a, b) => {
      if (a.isPrivate !== b.isPrivate) {
        return a.isPrivate ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [channelsData?.channels, memberOnly, filterChannels, effectiveName]);

  const virtualizer = useVirtualizer({
    count: filteredChannels.length,
    getScrollElement: () => scrollNode,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 20,
  });

  // Get selected channel info — fall back to the prop for manual entries
  const selectedChannel = useMemo(() => {
    if (!selectedChannelId) return null;
    const fromList = channelsData?.channels?.find(
      (channel) => channel.id === selectedChannelId,
    );
    return fromList ?? selectedChannelProp ?? null;
  }, [selectedChannelId, channelsData?.channels, selectedChannelProp]);

  const selectAndClose = useCallback(
    (channel: SlackChannel) => {
      onChannelSelect(channel);
      setOpen(false);
      setSearchValue("");
    },
    [onChannelSelect],
  );

  const handleSelectByName = useCallback(() => {
    const name = searchValue.trim().replace(/^#/, "");
    if (!name) return;
    selectAndClose({
      id: `#${name}`,
      name,
      isPrivate: false,
      isMember: false,
    });
  }, [searchValue, selectAndClose]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue("");
    }
  };

  useEffect(() => {
    if (scrollNode) {
      scrollNode.scrollTop = 0;
    }
  }, [effectiveName, scrollNode]);

  const hasExactMatch = filteredChannels.some(
    (channel) => channel.name.toLowerCase() === effectiveName.toLowerCase(),
  );
  const canUseTypedName = effectiveName.length > 0 && !hasExactMatch;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
              disabled={disabled}
            >
              {selectedChannel ? (
                <ChannelLabel channel={selectedChannel} />
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
              <Search
                size="base"
                color="default"
                __rawClassName="ml-2 opacity-50"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search channels..."
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandList ref={setScrollNode}>
                {canUseTypedName && (
                  <CommandGroup className="p-0">
                    <CommandItem
                      value={`use-${effectiveName}`}
                      onSelect={handleSelectByName}
                      className="cursor-pointer"
                    >
                      <Hash size="base" color="muted" />
                      <span
                        className="flex-1 truncate"
                        title={`Use &quot; ${effectiveName} &quot;`}
                      >
                        Use &quot;{effectiveName}&quot;
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
                {!isLoading &&
                  !canUseTypedName &&
                  filteredChannels.length === 0 && (
                    <CommandEmpty>No channels available.</CommandEmpty>
                  )}
                <CommandGroup
                  className="p-0"
                  style={{
                    height: virtualizer.getTotalSize(),
                    position: "relative",
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const channel = filteredChannels[virtualRow.index];
                    return (
                      <CommandItem
                        key={channel.id}
                        value={channel.id}
                        onSelect={() => selectAndClose(channel)}
                        className="cursor-pointer"
                        style={{
                          position: "absolute",
                          top: virtualRow.start,
                          left: 0,
                          width: "100%",
                          height: ITEM_HEIGHT,
                        }}
                      >
                        <ChannelLabel channel={channel} />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {isLoading && (
                  <CommandGroup className="p-0">
                    <CommandItem
                      value="loading-slack-channels"
                      disabled
                      className="text-muted-foreground"
                    >
                      <RefreshCw size="base" __rawClassName="animate-spin" />
                      <span
                        className="flex-1 truncate"
                        title="Loading Slack channels. This can take a while for large workspaces."
                      >
                        Loading Slack channels. This can take a while for large
                        workspaces.
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {showRefreshButton && (
          <IconButton
            icon={RefreshCw}
            label="Refresh channels"
            variant="outline"
            onClick={onRefresh}
            disabled={disabled || isRefreshing || isLoading}
          />
        )}
      </div>

      {hasError && (
        <Alert>
          <Alert.Description>
            Failed to load channels. You can still enter a channel name
            manually, or check your Slack connection and try again.
          </Alert.Description>
        </Alert>
      )}

      {/* Private channel scope warning */}
      {channelsData && !channelsData.hasPrivateChannelAccess && (
        <Alert icon={AlertTriangle} variant="warning" size="sm">
          <Alert.Title>Private channels are not visible</Alert.Title>
          <Alert.Description>
            To access private channels,{" "}
            <button
              type="button"
              className="font-bold underline"
              onClick={onReauthenticate}
            >
              re-authenticate your Slack integration
            </button>{" "}
            to grant the required permissions.
          </Alert.Description>
        </Alert>
      )}
    </div>
  );
};

const ChannelLabel = ({ channel }: { channel: SlackChannel }) => (
  <div className="flex w-full items-center gap-2">
    {channel.isPrivate ? (
      <Lock size="base" color="muted" />
    ) : (
      <Hash size="base" color="muted" />
    )}
    <span className="flex-1 truncate" title={channel.name}>
      {channel.name}
    </span>
  </div>
);
