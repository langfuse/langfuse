import { useId, useMemo, useRef, type ChangeEvent, type UIEvent } from "react";
import { FlaskConical } from "@langfuse/icons";

import {
  findGuardrailMatches,
  segmentsFromMatchSpans,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/components/GatewayGuardrailTestInput/fns/findGuardrailMatches";
import type { GatewayGuardrailPreset } from "@/src/features/ai-gateway/types/gatewayGuardrail";

export type GatewayGuardrailTestInputProps = {
  value: string;
  onChange: (value: string) => void;
  presets: readonly GatewayGuardrailPreset[];
  secretPrefixes?: readonly string[];
  containsWords?: readonly string[];
  /** Server-computed match spans from the Rust WASM engine (used by Custom regex). */
  customMatches?: readonly { start: number; end: number }[];
  /** True when the server preview stopped early to stay within the scan budget. */
  customMatchesTruncated?: boolean;
  usesGatewayPreview?: boolean;
};

const TEXT_LAYER_CLASS =
  "font-sans text-sm leading-6 break-words whitespace-pre-wrap p-3";

/**
 * Scratchpad that highlights spans matched by the selected built-in presets,
 * custom secret prefixes, contains words, or server-evaluated custom regex.
 */
export function GatewayGuardrailTestInput({
  value,
  onChange,
  presets,
  secretPrefixes,
  containsWords,
  customMatches,
  customMatchesTruncated = false,
  usesGatewayPreview = false,
}: GatewayGuardrailTestInputProps) {
  const inputId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(
    () =>
      usesGatewayPreview
        ? segmentsFromMatchSpans(value, customMatches ?? [])
        : findGuardrailMatches(value, {
            presets,
            secretPrefixes,
            containsWords,
          }),
    [
      value,
      presets,
      secretPrefixes,
      containsWords,
      customMatches,
      usesGatewayPreview,
    ],
  );

  const matchCount = useMemo(
    () => segments.filter((segment) => segment.matched).length,
    [segments],
  );

  const matchCountLabel = formatMatchCount(
    value,
    matchCount,
    usesGatewayPreview && customMatchesTruncated,
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-foreground inline-flex items-center gap-1.5 text-sm leading-none font-bold"
        >
          <FlaskConical size="base" color="muted" aria-hidden />
          <span>Test</span>
        </label>
        {matchCountLabel ? (
          <span className="text-muted-foreground text-xs leading-none tabular-nums">
            {matchCountLabel}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {usesGatewayPreview
          ? "Paste sample text to test your regex with the gateway engine. Sample text is not saved."
          : "Paste sample text to see what this guardrail catches. Matches highlight as you type. Nothing is sent or saved."}
      </p>
      <div className="bg-background border-input focus-within:ring-ring relative flex min-h-36 flex-1 overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-offset-2 md:min-h-60">
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
          rows={5}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          spellCheck={false}
          placeholder="Paste or type sample text to test…"
          className={`ph-no-capture placeholder:text-muted-foreground text-foreground caret-foreground relative block h-full min-h-36 w-full flex-1 resize-none border-0 bg-transparent outline-hidden md:min-h-60 ${TEXT_LAYER_CLASS}`}
        />
      </div>
    </div>
  );
}

function formatMatchCount(
  value: string,
  matchCount: number,
  truncated: boolean,
): string | null {
  if (value.trim().length === 0) return null;
  if (truncated) {
    if (matchCount === 0) return "Preview stopped early (partial results)";
    return `${matchCount}+ matches (partial preview)`;
  }
  if (matchCount === 0) return "No matches";
  if (matchCount === 1) return "1 match";
  return `${matchCount} matches`;
}
