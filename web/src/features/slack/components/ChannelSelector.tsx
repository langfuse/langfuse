import React, { useState, useMemo } from "react";
import { RefreshCw, Search, Hash, Lock } from "lucide-react";
import { Button } from "@/src/components/ui/button";

import { Select, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { api } from "@/src/utils/api";

/**
 * Represents a Slack channel
 */
export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

/**
 * Props for the ChannelSelector component
 */
interface ChannelSelectorProps {
  /** Project ID for the Slack integration */
  projectId: string;
  /** Currently selected channel ID */
  selectedChannelId?: string;
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
 *
 * @param projectId - The project ID for the Slack integration
 * @param selectedChannelId - Currently selected channel ID
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
    if (searchValue.trim()) {
      const searchTerm = searchValue.toLowerCase().trim();
      channels = channels.filter((channel) =>
        channel.name.toLowerCase().includes(searchTerm),
      );
    }

    // Sort channels: public channels first, then private, then by name
    return channels.sort((a, b) => {
      if (a.isPrivate !== b.isPrivate) {
        return a.isPrivate ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [channelsData?.channels, memberOnly, filterChannels, searchValue]);

  // Get selected channel info
  const selectedChannel = useMemo(() => {
    if (!selectedChannelId || !channelsData?.channels) return null;
    return channelsData.channels.find(
      (channel) => channel.id === selectedChannelId,
    );
  }, [selectedChannelId, channelsData?.channels]);

  // Handle channel selection
  const handleChannelSelect = (channel: SlackChannel) => {
    onChannelSelect(channel);
    setOpen(false);
    setSearchValue("");
  };

  // Render channel item
  const renderChannelItem = (channel: SlackChannel) => (
    <div className="flex w-full items-center gap-2">
      {channel.isPrivate ? (
        <Lock className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Hash className="h-4 w-4 text-muted-foreground" />
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
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
              <CommandList>
                <CommandEmpty>
                  {searchValue
                    ? "No channels match your search."
                    : "No channels available."}
                </CommandEmpty>
                <CommandGroup>
                  {filteredChannels.map((channel) => (
                    <CommandItem
                      key={channel.id}
                      value={channel.id}
                      onSelect={() => handleChannelSelect(channel)}
                      className="cursor-pointer"
                    >
                      {renderChannelItem(channel)}
                    </CommandItem>
                  ))}
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
        <div className="text-xs text-muted-foreground">
          {filteredChannels.length} of {channelsData.channels.length} channels
          {memberOnly && " (member only)"}
        </div>
      )}
    </div>
  );
};
