import { useId, useMemo, useRef, type ChangeEvent, type UIEvent } from "react";

import { findGuardrailMatches } from "@/src/features/ai-gateway/fns/findGuardrailMatches";
import type { GatewayGuardrailPreset } from "@/src/features/ai-gateway/types/gatewayGuardrail";

export type GatewayGuardrailTestInputProps = {
  value: string;
  onChange: (value: string) => void;
  presets: readonly GatewayGuardrailPreset[];
};

const TEXT_LAYER_CLASS =
  "font-sans text-sm leading-6 break-words whitespace-pre-wrap p-3";

/**
 * Client-side scratchpad that highlights spans matched by the selected built-in
 * presets' regexes as the user types. Nothing leaves the browser.
 */
export function GatewayGuardrailTestInput({
  value,
  onChange,
  presets,
}: GatewayGuardrailTestInputProps) {
  const inputId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(
    () => findGuardrailMatches(value, presets),
    [value, presets],
  );

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!backdropRef.current) return;
    backdropRef.current.scrollTop = event.currentTarget.scrollTop;
    backdropRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <label htmlFor={inputId} className="text-sm leading-none font-bold">
          Test
        </label>
        <span className="text-muted-foreground text-xs">
          Matches highlight as you type. Nothing is sent.
        </span>
      </div>
      <div className="bg-background border-input focus-within:ring-ring relative min-h-24 overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-offset-2">
        <div
          ref={backdropRef}
          aria-hidden
          className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent select-none ${TEXT_LAYER_CLASS}`}
        >
          {segments.map((segment, index) =>
            segment.matched ? (
              <mark
                key={index}
                className="rounded-xs bg-yellow-200/80 text-transparent dark:bg-yellow-500/35"
              >
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
          {/* Trailing newline keeps line height aligned when text ends with a newline. */}
          {value.endsWith("\n") ? "\n" : null}
        </div>
        <textarea
          id={inputId}
          rows={3}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          spellCheck={false}
          placeholder="Paste or type sample text to test…"
          className={`ph-no-capture placeholder:text-muted-foreground text-foreground caret-foreground relative block min-h-24 w-full resize-y border-0 bg-transparent outline-hidden ${TEXT_LAYER_CLASS}`}
        />
      </div>
    </div>
  );
}
