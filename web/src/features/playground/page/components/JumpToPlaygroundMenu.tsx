import { Terminal } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/design-system/Switch/Switch";

export type JumpToPlaygroundAction = "fresh" | "existing";

type JumpToPlaygroundMenuProps = {
  onPlaygroundAction: (action: JumpToPlaygroundAction) => void;
} & (
  | {
      source: "prompt";
    }
  | {
      source: "generation";
      includeOutput: boolean;
      onIncludeOutputChange: (includeOutput: boolean) => void;
    }
);

export function JumpToPlaygroundMenu({
  onPlaygroundAction,
  ...props
}: JumpToPlaygroundMenuProps) {
  return (
    <>
      <DropdownMenuItem onSelect={() => onPlaygroundAction("fresh")}>
        <Terminal className="mr-2 h-4 w-4" />
        Fresh playground
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onPlaygroundAction("existing")}>
        <Terminal className="mr-2 h-4 w-4" />
        Add to existing
      </DropdownMenuItem>
      {props.source === "generation" && (
        <>
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm">Include output</span>
            <Switch
              checked={props.includeOutput}
              onCheckedChange={props.onIncludeOutputChange}
            />
          </div>
        </>
      )}
    </>
  );
}
