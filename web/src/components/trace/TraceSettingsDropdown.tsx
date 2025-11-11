import { type ObservationLevelType, ObservationLevel } from "@langfuse/shared";
import { Settings2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/ui/switch";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export interface TraceSettingsDropdownProps {
  isGraphViewAvailable: boolean;
  showGraph: boolean;
  setShowGraph: (value: boolean) => void;
  showComments: boolean;
  setShowComments: (value: boolean) => void;
  scoresOnObservationTree: boolean;
  setScoresOnObservationTree: (value: boolean) => void;
  durationOnObservationTree: boolean;
  setDurationOnObservationTree: (value: boolean) => void;
  costTokensOnObservationTree: boolean;
  setCostTokensOnObservationTree: (value: boolean) => void;
  colorCodeMetricsOnObservationTree: boolean;
  setColorCodeMetricsOnObservationTree: (value: boolean) => void;
  minObservationLevel: ObservationLevelType;
  setMinObservationLevel: (level: ObservationLevelType) => void;
}

export const TraceSettingsDropdown = ({
  isGraphViewAvailable,
  showGraph,
  setShowGraph,
  showComments,
  setShowComments,
  scoresOnObservationTree,
  setScoresOnObservationTree,
  durationOnObservationTree,
  setDurationOnObservationTree,
  costTokensOnObservationTree,
  setCostTokensOnObservationTree,
  colorCodeMetricsOnObservationTree,
  setColorCodeMetricsOnObservationTree,
  minObservationLevel,
  setMinObservationLevel,
}: TraceSettingsDropdownProps) => {
  const capture = usePostHogClientCapture();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="View Options">
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>View Options</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isGraphViewAvailable && (
          <div className="p-1">
            <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
              <div className="flex w-full items-center justify-between">
                <span className="mr-2">Show Graph</span>
                <Switch
                  checked={showGraph}
                  onCheckedChange={(e) => setShowGraph(e)}
                />
              </div>
            </DropdownMenuItem>
          </div>
        )}

        <div className="space-y-1 p-1">
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Comments</span>
              <Switch
                checked={showComments}
                onCheckedChange={(e) => {
                  setShowComments(e);
                }}
              />
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Scores</span>
              <Switch
                checked={scoresOnObservationTree}
                onCheckedChange={(e) => {
                  capture("trace_detail:observation_tree_toggle_scores", {
                    show: e,
                  });
                  setScoresOnObservationTree(e);
                }}
              />
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Duration</span>
              <Switch
                checked={durationOnObservationTree}
                onCheckedChange={setDurationOnObservationTree}
              />
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Cost/Tokens</span>
              <Switch
                checked={costTokensOnObservationTree}
                onCheckedChange={setCostTokensOnObservationTree}
              />
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            asChild
            onSelect={(e) => e.preventDefault()}
            disabled={
              !durationOnObservationTree && !costTokensOnObservationTree
            }
            className={cn(
              !durationOnObservationTree &&
                !costTokensOnObservationTree &&
                "cursor-not-allowed",
            )}
          >
            <div
              className={cn(
                "flex w-full items-center justify-between",
                !durationOnObservationTree &&
                  !costTokensOnObservationTree &&
                  "cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "mr-2",
                  !durationOnObservationTree &&
                    !costTokensOnObservationTree &&
                    "cursor-not-allowed",
                )}
              >
                Color Code Metrics
              </span>
              <Switch
                checked={colorCodeMetricsOnObservationTree}
                onCheckedChange={(e) => setColorCodeMetricsOnObservationTree(e)}
                disabled={
                  !durationOnObservationTree && !costTokensOnObservationTree
                }
                className={cn(
                  !durationOnObservationTree &&
                    !costTokensOnObservationTree &&
                    "cursor-not-allowed",
                )}
              />
            </div>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex items-center">
              Min Level: {minObservationLevel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel className="font-semibold">
              Minimum Level
            </DropdownMenuLabel>
            {Object.values(ObservationLevel).map((level) => (
              <DropdownMenuItem
                key={level}
                onSelect={(e) => {
                  e.preventDefault();
                  setMinObservationLevel(level);
                }}
              >
                {level}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
