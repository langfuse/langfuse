import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

function ResponseFormatOption({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`Response format ${label}`}
      aria-pressed={isActive}
      className={cn(
        "inline-flex h-5 items-center rounded-[7px] px-2 text-[0.6875rem] font-medium tracking-[0.01em] transition-colors outline-none focus-visible:ring-0",
        isActive
          ? "bg-white text-[#202427] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
          : "text-foreground/50 hover:text-foreground/72",
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ResponseFormatSwitch({
  isJsonFormat,
  onChooseJson,
  onChooseNone,
}: {
  isJsonFormat: boolean;
  onChooseJson: () => void;
  onChooseNone: () => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-[9px] border border-[rgba(0,0,0,0.06)] bg-[rgba(255,255,255,0.52)] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
      data-testid="spielwiese-response-format-switch"
    >
      <ResponseFormatOption
        isActive={!isJsonFormat}
        label="None"
        onClick={onChooseNone}
      />
      <ResponseFormatOption
        isActive={isJsonFormat}
        label="JSON"
        onClick={onChooseJson}
      />
    </div>
  );
}

function ResponseFormatExpandTrigger({
  isEnabled,
  isOpen,
  nodeId,
  onClick,
}: {
  isEnabled: boolean;
  isOpen: boolean;
  nodeId: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-controls={`${nodeId}-json-format-panel`}
      aria-expanded={isEnabled && isOpen}
      aria-hidden={!isEnabled}
      aria-label="Toggle JSON response format panel"
      className={cn(
        "text-foreground/50 hover:text-foreground/72 inline-flex size-5 shrink-0 items-center justify-center rounded-[7px] transition-[opacity,color] outline-none focus-visible:ring-0",
        !isEnabled && "pointer-events-none opacity-0",
      )}
      data-testid="spielwiese-response-format-expand-trigger"
      tabIndex={isEnabled ? 0 : -1}
      type="button"
      onClick={() => {
        if (isEnabled) {
          onClick();
        }
      }}
    >
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "size-3 shrink-0 transition-transform",
          isOpen && "rotate-180",
        )}
      />
    </button>
  );
}

export function SpielwieseResponseFormatRow({
  leadingAccessory,
  isJsonFormat,
  isOpen,
  nodeId,
  onChooseJson,
  onChooseNone,
  onToggleOpen,
}: {
  leadingAccessory?: ReactNode;
  isJsonFormat: boolean;
  isOpen: boolean;
  nodeId: string;
  onChooseJson: () => void;
  onChooseNone: () => void;
  onToggleOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 pt-1",
        isOpen ? "pb-px" : "pb-1",
      )}
      data-testid="spielwiese-response-format-row"
    >
      {leadingAccessory ? (
        <div
          className="flex shrink-0 items-center"
          data-testid="spielwiese-response-format-leading-accessory"
        >
          {leadingAccessory}
        </div>
      ) : null}
      <div
        className="ml-auto flex shrink-0 items-center gap-2.5"
        data-testid="spielwiese-response-format-controls-cluster"
      >
        <span className="text-foreground/54 text-[0.6875rem] font-medium tracking-[0.01em]">
          Response Format
        </span>
        <ResponseFormatSwitch
          isJsonFormat={isJsonFormat}
          onChooseJson={onChooseJson}
          onChooseNone={onChooseNone}
        />
      </div>
      <ResponseFormatExpandTrigger
        isEnabled={isJsonFormat}
        isOpen={isOpen}
        nodeId={nodeId}
        onClick={onToggleOpen}
      />
    </div>
  );
}
