import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Timeline,
  TimelineItem,
} from "@/src/features/prompts/components/timeline";
import { cn } from "@/src/utils/tailwind";

export function SkillVersionHistory(
  props:
    | { kind: "new" }
    | {
        kind: "versions";
        versions: Array<{
          version: number;
          labels: string[];
          commitMessage: string | null;
          createdAt: Date;
        }>;
        selectedVersion: number;
        hasMore: boolean;
        isLoadingMore: boolean;
        loadMoreError: boolean;
        onLoadMore: () => void;
        dirty: boolean;
        onSelect: (version: number) => Promise<void>;
      },
) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sortedVersions =
    props.kind === "versions"
      ? [...props.versions].toSorted(
          (left, right) => right.version - left.version,
        )
      : [];
  const latestVersion = sortedVersions[0]?.version;
  const showDraft = props.kind === "new" || props.dirty;

  return (
    <aside
      className={cn(
        "ph-no-capture bg-muted/10 flex w-full shrink-0 flex-col border-b transition-[width,max-height] md:max-h-none md:border-r md:border-b-0",
        isCollapsed ? "max-h-11 md:w-11" : "max-h-56 md:w-56",
      )}
    >
      <div
        className={cn(
          "flex min-h-11 items-center border-b px-2",
          isCollapsed ? "justify-center" : "justify-between",
        )}
      >
        {isCollapsed ? null : (
          <span className="text-sm font-bold">Versions</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={
            isCollapsed ? "Expand version history" : "Collapse version history"
          }
          aria-expanded={!isCollapsed}
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
      {isCollapsed ? null : (
        <div className="overflow-y-auto p-2">
          <Timeline>
            {showDraft ? (
              <TimelineItem isActive>
                <div
                  className="flex w-full flex-col gap-1 text-left"
                  aria-current="page"
                >
                  <Badge variant="outline" className="w-fit">
                    Draft
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="h-5 w-fit max-w-full truncate px-1.5 text-[10px]"
                    title="Unreleased local changes"
                  >
                    Unreleased local changes
                  </Badge>
                </div>
              </TimelineItem>
            ) : null}
            {props.kind === "versions"
              ? sortedVersions.map(
                  ({ version, labels, commitMessage, createdAt }) => (
                    <TimelineItem
                      key={version}
                      isActive={
                        !props.dirty && version === props.selectedVersion
                      }
                    >
                      <button
                        type="button"
                        className="flex w-full flex-col gap-1 text-left"
                        aria-current={
                          !props.dirty && version === props.selectedVersion
                            ? "page"
                            : undefined
                        }
                        onClick={async () => {
                          if (version === props.selectedVersion) return;
                          if (
                            props.dirty &&
                            !window.confirm(
                              "Discard this unsaved draft and open another version?",
                            )
                          ) {
                            return;
                          }
                          await props.onSelect(version);
                        }}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <Badge variant="outline"># {version}</Badge>
                          {version === latestVersion ? (
                            <span className="text-muted-foreground text-xs">
                              Latest
                            </span>
                          ) : null}
                        </span>
                        {commitMessage ? (
                          <span
                            className="text-muted-foreground max-w-full truncate text-xs"
                            title={commitMessage}
                          >
                            {commitMessage}
                          </span>
                        ) : null}
                        <span
                          className="text-muted-foreground text-xs"
                          title={`Created ${createdAt.toLocaleString()}`}
                        >
                          {createdAt.toLocaleString()}
                        </span>
                        {labels.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {labels.map((label) => (
                              <Badge
                                key={label}
                                variant="secondary"
                                className="h-5 max-w-full truncate px-1.5 text-[10px]"
                                title={label}
                              >
                                {label}
                              </Badge>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    </TimelineItem>
                  ),
                )
              : null}
          </Timeline>
          {props.kind === "versions" && props.hasMore ? (
            <div className="flex flex-col gap-2 pt-2">
              {props.loadMoreError ? (
                <p role="alert" className="text-destructive text-xs">
                  Could not load older versions. Please try again.
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={props.isLoadingMore}
                loading={props.isLoadingMore}
                onClick={props.onLoadMore}
              >
                Load older versions
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
