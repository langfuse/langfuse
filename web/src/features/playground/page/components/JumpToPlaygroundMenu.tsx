import { Terminal } from "@langfuse/icons";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import type { PromptReplaySource } from "../utils/promptReplay";

export type JumpToPlaygroundAction = "fresh" | "existing";

type JumpToPlaygroundMenuProps = {
  onPlaygroundAction: (action: JumpToPlaygroundAction) => void;
  disabled?: boolean;
} & (
  | {
      source: "prompt";
    }
  | {
      source: "generation";
      includeOutput: boolean;
      onIncludeOutputChange: (includeOutput: boolean) => void;
      promptReplay?: {
        source: PromptReplaySource;
        recordedVersion: number | null;
        onSourceChange: (source: PromptReplaySource) => void;
        unavailableReason?: string;
      };
    }
);

export function JumpToPlaygroundMenu({
  onPlaygroundAction,
  disabled = false,
  ...props
}: JumpToPlaygroundMenuProps) {
  return (
    <>
      <DropdownMenuItem
        disabled={disabled}
        onSelect={() => onPlaygroundAction("fresh")}
      >
        <Terminal size="base" color="default" __rawClassName="mr-2" />
        Fresh playground
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={disabled}
        onSelect={() => onPlaygroundAction("existing")}
      >
        <Terminal size="base" color="default" __rawClassName="mr-2" />
        Add to existing
      </DropdownMenuItem>
      {props.source === "generation" && (
        <>
          {props.promptReplay && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Input source</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={props.promptReplay.source}>
                <DropdownMenuRadioItem
                  value="compiled"
                  disabled={disabled}
                  onSelect={(event) => {
                    event.preventDefault();
                    props.promptReplay?.onSourceChange("compiled");
                  }}
                >
                  Compiled messages
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="recorded"
                  disabled={
                    disabled || Boolean(props.promptReplay.unavailableReason)
                  }
                  onSelect={(event) => {
                    event.preventDefault();
                    props.promptReplay?.onSourceChange("recorded");
                  }}
                >
                  Recorded prompt
                  {props.promptReplay.recordedVersion !== null &&
                    ` (v${props.promptReplay.recordedVersion})`}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="latest"
                  disabled={
                    disabled || Boolean(props.promptReplay.unavailableReason)
                  }
                  onSelect={(event) => {
                    event.preventDefault();
                    props.promptReplay?.onSourceChange("latest");
                  }}
                >
                  Latest prompt version
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {props.promptReplay.unavailableReason && (
                <p className="text-muted-foreground max-w-64 px-2 py-1.5 text-xs">
                  {props.promptReplay.unavailableReason}
                </p>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm">Include output</span>
            <Switch
              checked={
                (!props.promptReplay ||
                  props.promptReplay.source === "compiled") &&
                props.includeOutput
              }
              disabled={
                disabled ||
                (props.promptReplay && props.promptReplay.source !== "compiled")
              }
              onCheckedChange={props.onIncludeOutputChange}
            />
          </div>
        </>
      )}
    </>
  );
}
