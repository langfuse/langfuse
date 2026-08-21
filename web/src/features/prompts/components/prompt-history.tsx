import { type RouterOutputs } from "@/src/utils/api";
import { type NextRouter, useRouter } from "next/router";
import { useState, useRef, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PromptVersionDiffDialogContent } from "./PromptVersionDiffDialog";
import {
  Timeline,
  TimelineItem,
} from "@/src/features/prompts/components/timeline";
import { Badge } from "@/src/components/ui/badge";
import { CommandItem } from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import { DialogController } from "@/src/components/ui/dialog";
import { SetPromptVersionLabels } from "@/src/features/prompts/components/SetPromptVersionLabels";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { FileDiffIcon } from "lucide-react";

// Fallback row height used before a row has been measured. Actual rows vary
// (commit message, wrapped labels), so the virtualizer re-measures each row
// via `measureElement` once mounted.
const ESTIMATED_ROW_HEIGHT = 76;

const PromptHistoryTraceNode = (props: {
  isLatest: boolean;
  prompt: RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];
  currentPrompt?: RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (version: number | undefined) => void;
  router: NextRouter;
  commentCounts?: Map<string, number>;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const { prompt } = props;

  // Add ref for scroll into view
  const currentPromptRef = useRef<HTMLDivElement>(null);

  // Add useEffect for scroll into view behavior
  useEffect(() => {
    if (
      props.currentPromptVersion &&
      currentPromptRef.current &&
      props.currentPromptVersion === prompt.version
    ) {
      currentPromptRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    // Should only trigger a single time on initial render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPromptRef.current]);

  return (
    <CommandItem
      ref={currentPromptRef}
      value={`# ${prompt.version};${prompt.commitMessage ?? ""};${prompt.labels.join(",")}`}
      style={{
        ["--selected-bg" as string]: "none",
        backgroundColor: "var(--selected-bg)",
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        cursor: "pointer",
      }}
    >
      <TimelineItem
        key={prompt.id}
        isActive={props.currentPromptVersion === prompt.version}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest('[role="button"]') ||
            target.closest('[data-version-trigger="true"]')
          ) {
            return;
          }

          props.isLatest
            ? props.setCurrentPromptVersion(undefined)
            : props.setCurrentPromptVersion(prompt.version);
        }}
      >
        <div
          className="items-start gap-1 space-y-1 rounded-none"
          style={{
            cursor: "pointer",
          }}
        >
          <div className="flex flex-wrap items-start gap-1">
            <SetPromptVersionLabels
              title={
                <Badge
                  onClick={(e) => {
                    e.stopPropagation();
                    props.isLatest
                      ? props.setCurrentPromptVersion(undefined)
                      : props.setCurrentPromptVersion(prompt.version);
                  }}
                  variant="outline"
                  className="bg-background/50 h-6 shrink-0"
                  data-version-trigger="false"
                >
                  # {prompt.version}
                </Badge>
              }
              promptLabels={prompt.labels}
              prompt={prompt}
              isOpen={isLabelPopoverOpen}
              setIsOpen={setIsLabelPopoverOpen}
              showOnlyOnHover
            />
            {props.commentCounts?.get(prompt.id) ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  props.router.push(
                    {
                      pathname: props.router.pathname,
                      query: {
                        ...props.router.query,
                        version: prompt.version,
                        comments: "open",
                        commentObjectType: "PROMPT",
                        commentObjectId: prompt.id,
                      },
                    },
                    undefined,
                    { shallow: true },
                  );
                }}
                className="cursor-pointer"
                role="button"
              >
                <CommentCountIcon count={props.commentCounts.get(prompt.id)} />
              </span>
            ) : null}
          </div>

          <div className="grid w-full grid-cols-1 items-start justify-between gap-1 md:grid-cols-[1fr_auto]">
            <div className="min-h-7 min-w-0">
              {prompt.commitMessage && (
                <div className="flex flex-1 flex-nowrap gap-2">
                  <span
                    className="text-muted-foreground max-w-full min-w-0 truncate text-xs"
                    title={prompt.commitMessage}
                  >
                    {prompt.commitMessage}
                  </span>
                </div>
              )}
              <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
                {prompt.createdAt.toLocaleString()} by{" "}
                {prompt.creator || prompt.createdBy}
              </div>
            </div>
            <div className="flex flex-row justify-end space-x-1">
              {props.currentPrompt &&
              props.currentPromptVersion !== prompt.version ? (
                <DialogController
                  size="xl"
                  closeOnInteractionOutside
                  renderContent={({ closeDialog }) => (
                    <PromptVersionDiffDialogContent
                      leftPrompt={prompt}
                      rightPrompt={props.currentPrompt!}
                      closeDialog={closeDialog}
                    />
                  )}
                >
                  {({ isOpen, Trigger }) =>
                    isHovered ||
                    props.currentPromptVersion === prompt.version ||
                    isOpen ? (
                      <Trigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          size="icon"
                          className="h-7 w-7 px-0"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          title="Compare with selected prompt"
                        >
                          <FileDiffIcon className="h-4 w-4" />
                        </Button>
                      </Trigger>
                    ) : null
                  }
                </DialogController>
              ) : null}
            </div>
          </div>
        </div>
      </TimelineItem>
    </CommandItem>
  );
};

export const PromptHistoryNode = (props: {
  prompts: RouterOutputs["prompts"]["allVersions"]["promptVersions"];
  currentPromptVersion: number | undefined;
  setCurrentPromptVersion: (id: number | undefined) => void;
  commentCounts?: Map<string, number>;
  // Free-text search term (from the sidebar's CommandInput). Filtering is
  // applied here, rather than delegated to cmdk's built-in filter, so that
  // only matching rows are virtualized/mounted.
  searchValue?: string;
  // The scrollable ancestor element the virtualizer should measure against.
  // Prompts with many versions can no longer mount every row into the DOM
  // (that froze the sidebar), so rows are virtualized and only need to be
  // measured against the actual scroll container.
  scrollElement: HTMLDivElement | null;
}) => {
  const router = useRouter();
  // The unfiltered list stays ordered by version desc (server-side), so the
  // first element is always the latest version regardless of the current
  // search term.
  const latestVersion = props.prompts[0]?.version;
  const currentPrompt = props.prompts.find(
    (p) => p.version === props.currentPromptVersion,
  );

  const filteredPrompts = useMemo(() => {
    const term = props.searchValue?.trim().toLowerCase();
    if (!term) return props.prompts;
    return props.prompts.filter((prompt) => {
      const haystack =
        `# ${prompt.version};${prompt.commitMessage ?? ""};${prompt.labels.join(",")}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [props.prompts, props.searchValue]);

  const virtualizer = useVirtualizer({
    count: filteredPrompts.length,
    getScrollElement: () => props.scrollElement,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => filteredPrompts[index]!.id,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <Timeline
      style={{ position: "relative", height: virtualizer.getTotalSize() }}
    >
      {virtualItems.map((virtualRow) => {
        const prompt = filteredPrompts[virtualRow.index]!;
        return (
          <div
            key={prompt.id}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <PromptHistoryTraceNode
              isLatest={prompt.version === latestVersion}
              prompt={prompt}
              currentPrompt={currentPrompt}
              currentPromptVersion={props.currentPromptVersion}
              setCurrentPromptVersion={props.setCurrentPromptVersion}
              router={router}
              commentCounts={props.commentCounts}
            />
          </div>
        );
      })}
    </Timeline>
  );
};
