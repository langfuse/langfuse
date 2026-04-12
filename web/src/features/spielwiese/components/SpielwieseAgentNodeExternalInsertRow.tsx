import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";

type SpielwieseAgentNodeExternalInsertRowProps = {
  nodeId: string;
  onAgentNodeInsert: (nodeId: string, kind: "user" | "agent") => void;
};

const agentNodeInsertOptions: Array<{
  kind: "user" | "agent";
  label: string;
}> = [
  { kind: "user", label: "User" },
  { kind: "agent", label: "Agent" },
];

const agentNodeInsertRowClassName =
  "pointer-events-auto relative mt-[8px] ml-[18px] inline-flex w-fit pl-[18px] opacity-100";
const agentNodeInsertShellClassName =
  "[--message-insert-inner-radius:7px] [--message-insert-padding:2px] [--message-insert-outer-radius:calc(var(--message-insert-inner-radius)+var(--message-insert-padding))] [--agent-node-insert-inner-radius:7px] [--agent-node-insert-padding:2px] [--agent-node-insert-outer-radius:calc(var(--agent-node-insert-inner-radius)+var(--agent-node-insert-padding))] bg-background inline-flex h-7 items-stretch overflow-hidden rounded-[var(--message-insert-outer-radius)] border border-[rgba(0,0,0,0.08)] p-[var(--message-insert-padding)] shadow-[0_1px_0_rgba(255,255,255,0.5)_inset]";
const agentNodeInsertTriggerClassName =
  "text-foreground/78 hover:text-foreground h-full rounded-[calc(var(--agent-node-insert-outer-radius)-var(--agent-node-insert-padding))] border-0 bg-transparent px-3 text-[13px] font-medium shadow-none transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-transparent active:scale-[0.985]";
const agentNodeInsertPickerClassName =
  "flex h-full shrink-0 items-stretch overflow-hidden rounded-r-[calc(var(--agent-node-insert-outer-radius)-var(--agent-node-insert-padding))] transition-[max-width,background-color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";
const agentNodeInsertPickerOptionsClassName =
  "flex h-full w-max items-center gap-px px-[var(--agent-node-insert-padding)] transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";
const agentNodeInsertOptionClassName =
  "text-foreground/72 hover:bg-background/80 hover:text-foreground inline-flex h-full items-center rounded-[calc(var(--agent-node-insert-outer-radius)-var(--agent-node-insert-padding))] border-0 bg-transparent px-2 text-[11px] font-medium";

function AgentNodeInsertPicker({
  isOpen,
  nodeId,
  onAgentNodeInsert,
  onClose,
}: {
  isOpen: boolean;
  nodeId: string;
  onAgentNodeInsert: (nodeId: string, kind: "user" | "agent") => void;
  onClose: () => void;
}) {
  return (
    <div
      aria-hidden={!isOpen}
      className={cn(
        agentNodeInsertPickerClassName,
        isOpen
          ? "max-w-[8rem] bg-[rgba(0,0,0,0.035)]"
          : "pointer-events-none max-w-0 bg-transparent",
      )}
      data-state={isOpen ? "open" : "closed"}
      data-testid="spielwiese-agent-node-insert-picker"
      id={`${nodeId}-agent-node-insert-picker`}
    >
      <div
        className={cn(
          agentNodeInsertPickerOptionsClassName,
          isOpen
            ? "translate-x-0 opacity-100 delay-75"
            : "-translate-x-0.5 opacity-0 delay-0",
        )}
      >
        {agentNodeInsertOptions.map((option) => (
          <Button
            className={agentNodeInsertOptionClassName}
            disabled={!isOpen}
            key={option.kind}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              onAgentNodeInsert(nodeId, option.kind);
              onClose();
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function SpielwieseAgentNodeExternalInsertRow({
  nodeId,
  onAgentNodeInsert,
}: SpielwieseAgentNodeExternalInsertRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={agentNodeInsertRowClassName}
      data-testid="spielwiese-agent-node-external-insert-row"
      onBlurCapture={(event) => {
        const nextFocusedElement = event.relatedTarget;

        if (
          !(nextFocusedElement instanceof Node) ||
          !event.currentTarget.contains(nextFocusedElement)
        ) {
          setIsOpen(false);
        }
      }}
    >
      <div
        className={agentNodeInsertShellClassName}
        data-testid="spielwiese-agent-node-insert-shell"
      >
        <Button
          aria-controls={`${nodeId}-agent-node-insert-picker`}
          aria-expanded={isOpen}
          aria-label="Toggle new node tray"
          className={agentNodeInsertTriggerClassName}
          data-testid="spielwiese-agent-node-insert-trigger"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setIsOpen((currentState) => !currentState)}
        >
          New node
        </Button>
        <AgentNodeInsertPicker
          isOpen={isOpen}
          nodeId={nodeId}
          onAgentNodeInsert={onAgentNodeInsert}
          onClose={() => setIsOpen(false)}
        />
      </div>
    </div>
  );
}
