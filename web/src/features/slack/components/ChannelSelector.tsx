import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  RefreshCw,
  Search,
  Hash,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
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
import { Progress } from "@/src/components/ui/progress";
import { useSlackChannelsStream } from "@/src/features/slack/hooks/useSlackChannelsStream";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

/**
 * Represents a Slack channel
 */
export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

interface ChannelSelectorProps {
  projectId: string;
  selectedChannelId?: string;
  onChannelSelect: (channel: SlackChannel | null) => void;
  disabled?: boolean;
  placeholder?: string;
  memberOnly?: boolean;
  filterChannels?: (channel: SlackChannel) => boolean;
  showRefreshButton?: boolean;
}

type ManualValidation = "idle" | "checking" | "found" | "not_found";

const SLACK_INTEGRATION_DOCS_URL =
  "https://github.com/langfuse/langfuse/blob/main/web/src/features/slack/README.md";

/** Align with {@link SlackService.normalizeSlackChannelName} (client-side only). */
function normalizeSlackChannelNameInput(raw: string): string {
  return raw.trim().replace(/^#+/u, "").toLowerCase();
}

/**
 * Manual channel name entry with Slack validation, or browse all channels after "Fetch channels".
 */
export const ChannelSelector: React.FC<ChannelSelectorProps> = ({
  projectId,
  selectedChannelId,
  onChannelSelect,
  disabled = false,
  placeholder = "Channel name (e.g. general)",
  memberOnly = false,
  filterChannels,
  showRefreshButton = true,
}) => {
  const [browseListEnabled, setBrowseListEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [debouncedManual, setDebouncedManual] = useState("");
  const [manualValidation, setManualValidation] =
    useState<ManualValidation>("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    channelsData,
    progress,
    rateLimitSecondsRemaining,
    isLoading,
    error: streamError,
    refetch: refetchChannels,
  } = useSlackChannelsStream(projectId, {
    enabled: !!projectId && browseListEnabled,
  });

  const lookupMutation = api.slack.lookupChannel.useMutation();
  const prevDebouncedQRef = useRef<string>("");
  const lookupSeqRef = useRef(0);
  const onChannelSelectRef = useRef(onChannelSelect);
  const lookupMutateRef = useRef(lookupMutation.mutate);
  const lookupResetRef = useRef(lookupMutation.reset);

  onChannelSelectRef.current = onChannelSelect;
  lookupMutateRef.current = lookupMutation.mutate;
  lookupResetRef.current = lookupMutation.reset;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedManual(manualValue), 450);
    return () => window.clearTimeout(t);
  }, [manualValue]);

  useEffect(() => {
    if (browseListEnabled) {
      return;
    }
    const q = debouncedManual.trim().replace(/^#+/u, "");
    const prevQ = prevDebouncedQRef.current;
    prevDebouncedQRef.current = q;

    if (q.length < 1) {
      lookupSeqRef.current += 1;
      setManualValidation("idle");
      lookupResetRef.current();
      if (prevQ.length >= 1) {
        onChannelSelectRef.current(null);
      }
      return;
    }

    const seq = ++lookupSeqRef.current;

    const targetNorm = normalizeSlackChannelNameInput(q);
    const fromFetchedList = channelsData?.channels?.find(
      (c) => normalizeSlackChannelNameInput(c.name) === targetNorm,
    );
    if (fromFetchedList) {
      setManualValidation("found");
      onChannelSelectRef.current(fromFetchedList);
      lookupResetRef.current();
      return;
    }

    setManualValidation("checking");
    lookupMutateRef.current(
      { projectId, channelName: q },
      {
        onSuccess: (data) => {
          if (seq !== lookupSeqRef.current) return;
          if (data.found && data.channel) {
            setManualValidation("found");
            onChannelSelectRef.current(data.channel);
          } else {
            setManualValidation("not_found");
            onChannelSelectRef.current(null);
          }
        },
        onError: () => {
          if (seq !== lookupSeqRef.current) return;
          setManualValidation("idle");
        },
      },
    );
  }, [browseListEnabled, debouncedManual, projectId, channelsData?.channels]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchChannels();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleManualChange = useCallback((value: string) => {
    setManualValue(value);
  }, []);

  const enterBrowseMode = () => {
    lookupSeqRef.current += 1;
    setBrowseListEnabled(true);
    setOpen(false);
    setSearchValue("");
  };

  const filteredChannels = useMemo(() => {
    if (!channelsData?.channels) return [];

    let channels = channelsData.channels;

    if (memberOnly) {
      channels = channels.filter((channel) => channel.isMember);
    }

    if (filterChannels) {
      channels = channels.filter(filterChannels);
    }

    if (searchValue.trim()) {
      const searchTerm = searchValue.toLowerCase().trim();
      channels = channels.filter((channel) =>
        channel.name.toLowerCase().includes(searchTerm),
      );
    }

    return channels.sort((a, b) => {
      if (a.isPrivate !== b.isPrivate) {
        return a.isPrivate ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [channelsData?.channels, memberOnly, filterChannels, searchValue]);

  const selectedChannel = useMemo(() => {
    if (!selectedChannelId) return null;
    if (channelsData?.channels) {
      const fromList = channelsData.channels.find(
        (c) => c.id === selectedChannelId,
      );
      if (fromList) return fromList;
    }
    if (
      lookupMutation.data?.found &&
      lookupMutation.data.channel?.id === selectedChannelId
    ) {
      return lookupMutation.data.channel;
    }
    return null;
  }, [selectedChannelId, channelsData?.channels, lookupMutation.data]);

  const enterManualMode = () => {
    setBrowseListEnabled(false);
    setOpen(false);
    setSearchValue("");
    if (selectedChannel?.name) {
      setManualValue(selectedChannel.name);
    }
  };

  const handleChannelSelect = (channel: SlackChannel) => {
    onChannelSelect(channel);
    setOpen(false);
    setSearchValue("");
  };

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

  const progressBarValue = (() => {
    if (!isLoading) return 0;
    if (progress) {
      const cap = Math.max(1, progress.fetchLimit);
      const pct = (progress.channelsLoadedSoFar / cap) * 100;
      return progress.hasMore ? Math.min(99, pct) : Math.min(100, pct);
    }
    return 1;
  })();

  const manualStatusIcon = (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center">
      {manualValidation === "checking" && (
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      )}
      {manualValidation === "found" && (
        <CheckCircle2
          className="h-5 w-5 text-green-600 dark:text-green-500"
          aria-label="Channel found"
        />
      )}
      {manualValidation === "not_found" && (
        <XCircle
          className="h-5 w-5 text-red-600 dark:text-red-500"
          aria-label="Channel not found"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {!browseListEnabled && (
        <div className="space-y-2">
          <div className="flex max-w-md items-center gap-2">
            <Input
              value={manualValue}
              onChange={(e) => handleManualChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              autoComplete="off"
              className="flex-1"
              aria-invalid={manualValidation === "not_found"}
            />
            {manualStatusIcon}
          </div>
          <p className="text-muted-foreground max-w-md text-xs leading-relaxed">
            Enter channel name (# prefix optional) or ID from Slack (e.g.{" "}
            <span className="font-mono">C012…</span> from channel details). See{" "}
            <a
              href={SLACK_INTEGRATION_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Slack integration documentation
            </a>{" "}
            for more.
          </p>
          <p className="text-muted-foreground max-w-md text-xs leading-relaxed">
            Invite the Langfuse app into the channel so messages are
            delivered—required for private channels, recommended for public
            ones.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={enterBrowseMode}
          >
            Fetch channels
          </Button>
        </div>
      )}

      {browseListEnabled && isLoading && (
        <div className="max-w-md space-y-3">
          {rateLimitSecondsRemaining !== null && (
            <Alert>
              <AlertDescription>
                API rate limit hit, backing off for {rateLimitSecondsRemaining}{" "}
                second
                {rateLimitSecondsRemaining === 1 ? "" : "s"}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Progress value={progressBarValue} className="h-2" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              {progress ? (
                progress.hasMore ? (
                  <>
                    {progress.channelsLoadedSoFar} channels fetched, fetching
                    more…
                    <span className="text-muted-foreground/80">
                      {" "}
                      ({progress.fetchLimit} max)
                    </span>
                  </>
                ) : (
                  <>
                    {progress.channelsLoadedSoFar} channels fetched, finishing
                    up…
                    <span className="text-muted-foreground/80">
                      {" "}
                      ({progress.fetchLimit} max)
                    </span>
                  </>
                )
              ) : (
                "Connecting to Slack…"
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={enterManualMode}
          >
            Enter channel name instead
          </Button>
        </div>
      )}

      {browseListEnabled && streamError && (
        <div className="max-w-md space-y-2">
          <Alert variant="destructive">
            <AlertDescription>{streamError}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRefresh}
            >
              Retry
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={enterManualMode}
            >
              Enter channel name instead
            </Button>
          </div>
        </div>
      )}

      {browseListEnabled && !isLoading && !streamError && channelsData && (
        <div className="space-y-2">
          <div className="flex max-w-md items-center gap-2">
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
                    <span className="text-muted-foreground">
                      Select a channel
                    </span>
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
                  className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                />
              </Button>
            )}
          </div>

          {channelsData.channels.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {filteredChannels.length} of {channelsData.channels.length}{" "}
              channels
              {memberOnly && " (member only)"}
            </p>
          )}

          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={enterManualMode}
          >
            Enter channel name instead
          </Button>
        </div>
      )}
    </div>
  );
};
