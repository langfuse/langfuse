import { type MouseEvent, useState } from "react";
import { FileDiffIcon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Timeline } from "@/src/components/design-system/Timeline/Timeline";
import { cn } from "@/src/utils/tailwind";
import { SkillLabelsSelect } from "./SkillMetadataSelect";
import { SkillVersionComparisonController } from "./SkillVersionComparison";

export function SkillVersionHistory(
  props:
    | { kind: "new" }
    | {
        kind: "versions";
        projectId: string;
        name: string;
        versions: Array<{
          version: number;
          labels: string[];
          commitMessage: string | null;
          createdAt: Date;
          createdBy: string;
          creator: string | null | undefined;
        }>;
        selectedVersion: number;
        hasMore: boolean;
        isLoadingMore: boolean;
        loadMoreError: boolean;
        onLoadMore: () => void;
        dirty: boolean;
        isDraft: boolean;
        canEdit: boolean;
        labelOptions: string[];
        isSavingLabels: boolean;
        onSaveLabels: (version: number, labels: string[]) => Promise<boolean>;
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
  const showDraft = props.kind === "new" || props.isDraft;

  const selectVersion = async (version: number) => {
    if (
      props.kind !== "versions" ||
      (!props.isDraft && version === props.selectedVersion)
    )
      return;
    if (
      props.dirty &&
      !window.confirm("Discard this unsaved draft and open another version?")
    ) {
      return;
    }
    await props.onSelect(version);
  };

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
            <PanelLeftOpen className="icon-base text-icon-foreground" />
          ) : (
            <PanelLeftClose className="icon-base text-icon-foreground" />
          )}
        </Button>
      </div>
      {isCollapsed ? null : (
        <div className="overflow-y-auto p-2">
          <Timeline>
            {showDraft ? (
              <Timeline.Item isActive>
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
              </Timeline.Item>
            ) : null}
            {props.kind === "versions"
              ? sortedVersions.map(
                  ({
                    version,
                    labels,
                    commitMessage,
                    createdAt,
                    createdBy,
                    creator,
                  }) => (
                    <Timeline.Item
                      key={version}
                      isActive={
                        !props.isDraft && version === props.selectedVersion
                      }
                    >
                      <div className="group/skill-version flex w-full flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Open version ${version}`}
                            aria-current={
                              !props.isDraft &&
                              version === props.selectedVersion
                                ? "page"
                                : undefined
                            }
                            onClick={() => selectVersion(version)}
                          >
                            <Badge
                              variant="outline"
                              className="bg-background/50 h-6 shrink-0"
                            >
                              # {version}
                            </Badge>
                          </button>
                          <SkillLabelsSelect
                            showOnlyOnHover
                            value={labels}
                            options={props.labelOptions}
                            disabled={!props.canEdit || props.isSavingLabels}
                            isSaving={props.isSavingLabels}
                            onSave={(nextLabels) =>
                              props.onSaveLabels(version, nextLabels)
                            }
                          />
                        </div>
                        <div className="flex items-start gap-1">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                            aria-current={
                              !props.isDraft &&
                              version === props.selectedVersion
                                ? "page"
                                : undefined
                            }
                            onClick={() => selectVersion(version)}
                          >
                            {commitMessage ? (
                              <span
                                className="text-muted-foreground max-w-full truncate text-xs"
                                title={commitMessage}
                              >
                                {commitMessage}
                              </span>
                            ) : null}
                            <span
                              className="text-muted-foreground flex flex-wrap gap-1 text-xs break-words"
                              title={`Created ${createdAt.toLocaleString()}`}
                            >
                              {createdAt.toLocaleString()} by{" "}
                              {creator || createdBy}
                            </span>
                          </button>
                          {version !== props.selectedVersion ? (
                            <SkillVersionComparisonController
                              {...props}
                              versions={sortedVersions}
                            >
                              {({ openComparison }) => {
                                function handleCompareClick(
                                  event: MouseEvent<HTMLButtonElement>,
                                ) {
                                  event.stopPropagation();
                                  openComparison(version);
                                }
                                return (
                                  <div className="shrink-0 group-focus-within/skill-version:opacity-100 group-hover/skill-version:opacity-100 [@media(hover:hover)]:opacity-0">
                                    <IconButton
                                      icon={FileDiffIcon}
                                      label={`Compare version ${version} with selected version ${props.selectedVersion}`}
                                      title="Compare with selected version"
                                      variant="outline"
                                      size="sm"
                                      onClick={handleCompareClick}
                                    />
                                  </div>
                                );
                              }}
                            </SkillVersionComparisonController>
                          ) : null}
                        </div>
                      </div>
                    </Timeline.Item>
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
