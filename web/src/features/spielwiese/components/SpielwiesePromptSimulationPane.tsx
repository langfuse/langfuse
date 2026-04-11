import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Input } from "../ui/input";
import {
  getDefaultEditableInput,
  getPlaygroundSignature,
} from "./spielwiesePlaygroundPreview";

function PlaygroundTerminalLine({
  draftValue,
  onDraftChange,
}: {
  draftValue: string;
  onDraftChange: (value: string) => void;
}) {
  return (
    <label
      className="flex min-w-0 items-center gap-3"
      data-testid="spielwiese-playground-terminal-line"
    >
      <div className="text-muted-foreground/55 font-mono text-base sm:text-sm">
        {">"}
      </div>
      <Input
        aria-label="Playground input"
        className="caret-foreground text-foreground placeholder:text-muted-foreground/55 h-auto border-0 bg-transparent px-0 py-0 font-mono text-base shadow-none focus-visible:ring-0 sm:text-sm"
        name="playground-input"
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Type a message"
        spellCheck={false}
        value={draftValue}
      />
    </label>
  );
}

function PlaygroundSurface({
  draftValue,
  onDraftChange,
}: {
  draftValue: string;
  onDraftChange: (value: string) => void;
}) {
  return (
    <div
      className="border-border/70 flex h-full min-h-0 flex-col overflow-hidden rounded-none border-x border-t-0 border-b bg-[#F5F5F5] p-2"
      data-testid="spielwiese-prompt-simulation-pane"
    >
      <div
        className="bg-background flex min-h-0 flex-1 items-start rounded-[8px] px-4 py-3 shadow-xs"
        data-testid="spielwiese-playground-terminal-shell"
      >
        <PlaygroundTerminalLine
          draftValue={draftValue}
          onDraftChange={onDraftChange}
        />
      </div>
    </div>
  );
}

export function SpielwiesePromptSimulationPane({
  nodes,
}: {
  nodes: SpielwieseAgentNodeVM[];
}) {
  const defaultEditableInput = getDefaultEditableInput(nodes);
  const signature = getPlaygroundSignature(nodes);
  const [playgroundState, setPlaygroundState] = useState(() => ({
    draftValue: defaultEditableInput,
    signature,
  }));

  if (playgroundState.signature !== signature) {
    setPlaygroundState({
      draftValue: defaultEditableInput,
      signature,
    });
  }

  return (
    <PlaygroundSurface
      draftValue={playgroundState.draftValue}
      onDraftChange={(value) =>
        setPlaygroundState((currentState) => ({
          ...currentState,
          draftValue: value,
        }))
      }
    />
  );
}
