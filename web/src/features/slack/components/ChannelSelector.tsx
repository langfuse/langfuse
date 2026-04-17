import React, { useState, useMemo, useCallback, useEffect } from "react";
import { RefreshCw, Search, Hash, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Select, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "@/src/utils/api";
import { type SlackChannel } from "@langfuse/shared/src/server";

export type { SlackChannel };

/**
 * Props for the ChannelSelector component
 */
interface ChannelSelectorProps {
  /** Project ID for the Slack integration */
  projectId: string;
  /** Currently selected channel ID */
  selectedChannelId?: string;
  /** Full channel object for display when the ID isn't in the fetched list (e.g. manual entry) */
  selectedChannel?: SlackChannel | null;
  /** Callback when a channel is selected */
  onChannelSelect: (channel: SlackChannel) => void;
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

const ITEM_HEIGHT = 32;

/**
 * A dropdown component for selecting Slack channels with search and filtering capabilities.
 *
 * This component handles:
 * - Fetching available channels from the Slack API
 * - Providing search functionality to filter channels
 * - Displaying channel type indicators (public/private)
 * - Showing membership status for each channel
 * - Handling loading and error states
 * - Refreshing the channel list
 *
 * The component uses a command palette style interface for better UX when dealing with
 * many channels. It supports both keyboard navigation and mouse interaction.
 * Items are virtualized with @tanstack/react-virtual to handle large channel lists (~5k).
 *
 * @param projectId - The project ID for the Slack integration
 * @param selectedChannelId - Currently selected channel ID
 * @param selectedChannel - Full channel object for display when the ID isn't in the fetched list (e.g. manual entry)
 * @param onChannelSelect - Callback when a channel is selected
 * @param disabled - Whether the component should be disabled
 * @param placeholder - Placeholder text for the selector
 * @param memberOnly - Whether to show only channels the bot is a member of
 * @param filterChannels - Custom filter function for channels
 * @param showRefreshButton - Whether to show the refresh button
 */
export const ChannelSelector: React.FC<ChannelSelectorProps> = ({
  projectId,
  selectedChannelId,
  selectedChannel: selectedChannelProp,
  onChannelSelect,
  disabled = false,
  placeholder = "Select a channel",
  memberOnly = false,
  filterChannels,
  showRefreshButton = true,
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const trimmedSearch = searchValue.trim();
  const effectiveName = trimmedSearch.replace(/^#/, "");

  // Get available channels
  const {
    data: channelsData,
    isLoading,
    error,
    refetch: refetchChannels,
  } = api.slack.getChannels.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      // Keep data fresh
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchChannels();
    } finally {
      setIsRefreshing(false);
    }
  };

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

  useEffect(() => {
    if (scrollNode) {
      scrollNode.scrollTop = 0;
    }
  }, [effectiveName, scrollNode]);

  // Render channel item
  const renderChannelItem = (channel: SlackChannel) => (
    <div className="flex w-full items-center gap-2">
      {channel.isPrivate ? (
        <Lock className="text-muted-foreground h-4 w-4" />
      ) : (
        <Hash className="text-muted-foreground h-4 w-4" />
      )}
      <span className="flex-1 truncate">{channel.name}</span>
    </div>
  );

  // Handle loading state
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder="Loading channels..." />
            </SelectTrigger>
          </Select>
          {showRefreshButton && (
            <Button variant="outline" size="sm" disabled>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder="Error loading channels" />
            </SelectTrigger>
          </Select>
          {showRefreshButton && (
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Alert>
          <AlertDescription>
            Failed to load channels. Please check your Slack connection and try
            again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasExactMatch = filteredChannels.some(
    (channel) => channel.name.toLowerCase() === effectiveName.toLowerCase(),
  );
  const canUseTypedName = effectiveName.length > 0 && !hasExactMatch;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover
          open={open}
          onOpenChange={(newOpen) => {
            setOpen(newOpen);
            if (!newOpen) {
              setSearchValue("");
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
              disabled={disabled}
            >
              {selectedChannel ? (
                renderChannelItem(selectedChannel)
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
              <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                      <Hash className="text-muted-foreground h-4 w-4" />
                      <span className="flex-1 truncate">
                        Use &quot;{effectiveName}&quot;
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
                {!canUseTypedName && filteredChannels.length === 0 && (
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
                        {renderChannelItem(channel)}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {showRefreshButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={disabled || isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        )}
      </div>

      {/* Channel stats */}
      {channelsData?.channels && (
        <div className="text-muted-foreground text-xs">
          {filteredChannels.length} of {channelsData.channels.length} channels
          {memberOnly && " (member only)"}
        </div>
      )}

      {/* Private channel scope warning */}
      {channelsData && !channelsData.hasPrivateChannelAccess && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Private channels are not visible. To access private channels,{" "}
            <button
              type="button"
              className="font-medium underline"
              onClick={() =>
                window.open(
                  `/api/public/slack/install?projectId=${projectId}`,
                  "slack-reauth",
                  "width=600,height=700",
                )
              }
            >
              re-authenticate your Slack integration
            </button>{" "}
            to grant the required permissions.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
