"use client";

import type { CSSProperties } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import {
  SpielwieseModelPickerProviderPane,
  SpielwieseModelPickerSelectionPane,
} from "./spielwieseModelPickerPanes";
import {
  getPreviewModel,
  getSelectedProvider,
  getVisibleModels,
  isCurrentModel,
} from "./spielwieseModelPickerState";

export { SpielwieseModelPickerTrigger } from "./SpielwieseModelPickerTrigger";

const spielwieseModelPickerPanelClassName =
  "w-fit max-w-[calc(100vw-1rem)] overflow-visible rounded-[var(--spielwiese-picker-outer-radius)] border border-[rgba(0,0,0,0.08)] bg-[#FCFCFA] p-[var(--spielwiese-picker-padding)] shadow-[0_18px_38px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.08)] [--spielwiese-picker-outer-radius:18px] [--spielwiese-picker-padding:6px] [--spielwiese-picker-open-delay:0ms] [--spielwiese-picker-open-duration:220ms] [--spielwiese-picker-close-duration:160ms] will-change-[transform,opacity] ease-[cubic-bezier(0.32,0.72,0,1)] data-[open]:animate-in data-[closed]:animate-out data-[open]:[animation-duration:var(--spielwiese-picker-open-duration)] data-[closed]:[animation-duration:var(--spielwiese-picker-close-duration)] data-[open]:[animation-delay:var(--spielwiese-picker-open-delay)] data-[open]:[animation-fill-mode:backwards] data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1";
const anthropicApiKeyHref = "https://console.anthropic.com/settings/keys";
const spielwieseModelPickerAnthropicApiKeyPaneClassName =
  "grid min-w-[23rem] gap-3 rounded-[var(--spielwiese-picker-inner-radius)] border border-[rgba(0,0,0,0.05)] bg-white/72 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] [--spielwiese-picker-inner-radius:calc(var(--spielwiese-picker-outer-radius)-var(--spielwiese-picker-padding))] [--spielwiese-picker-pane-delay:0ms] [--spielwiese-picker-pane-duration:220ms] animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 [animation-duration:var(--spielwiese-picker-pane-duration)] [animation-delay:var(--spielwiese-picker-pane-delay)] [animation-fill-mode:backwards] will-change-[transform,opacity] ease-[cubic-bezier(0.32,0.72,0,1)] sm:min-w-[28rem]";

type SpielwieseModelPickerStyle = CSSProperties & {
  "--spielwiese-picker-close-duration"?: string;
  "--spielwiese-picker-open-duration"?: string;
  "--spielwiese-picker-open-delay"?: string;
  "--spielwiese-picker-pane-duration"?: string;
  "--spielwiese-picker-pane-delay"?: string;
};

export function getModelPickerAnimationStyle({
  valueMs,
  variableName,
}: {
  valueMs?: number;
  variableName:
    | "--spielwiese-picker-close-duration"
    | "--spielwiese-picker-open-duration"
    | "--spielwiese-picker-open-delay"
    | "--spielwiese-picker-pane-duration"
    | "--spielwiese-picker-pane-delay";
}): SpielwieseModelPickerStyle | undefined {
  if (valueMs === undefined) {
    return undefined;
  }

  return {
    [variableName]: `${valueMs}ms`,
  };
}

export type SpielwieseModelPickerProps = {
  anthropicApiKeyValue?: string;
  apiKeyPaneAnimationDelayMs?: number;
  apiKeyPaneAnimationDurationMs?: number;
  closeOnSelect?: boolean;
  currentModel: string;
  hoveredModelLabel: string | null;
  onClose: () => void;
  onAnthropicApiKeyChange?: (value: string) => void;
  onAnthropicApiKeyContinue?: () => void;
  onValueChange: (value: string) => void;
  popoverAnimationDelayMs?: number;
  popoverAnimationDurationMs?: number;
  providerId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  showAnthropicApiKeyPrompt?: boolean;
};

function SpielwieseModelPickerGrid({
  closeOnSelect,
  currentModel,
  onClose,
  onValueChange,
  previewModel,
  provider,
  setHoveredModelLabel,
  setProviderId,
  visibleModels,
}: {
  closeOnSelect?: boolean;
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  previewModel: SpielwieseModelOption | null;
  provider: SpielwieseModelProvider | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  visibleModels: SpielwieseModelOption[];
}) {
  return (
    <div
      className={cn(
        "grid h-auto min-w-0 items-start overflow-hidden rounded-[var(--spielwiese-picker-inner-radius)] border border-[rgba(0,0,0,0.05)] bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] [--spielwiese-picker-inner-radius:calc(var(--spielwiese-picker-outer-radius)-var(--spielwiese-picker-padding))]",
        provider ? "grid-cols-[11.5rem_auto]" : "grid-cols-[11.5rem]",
      )}
      data-testid="spielwiese-model-picker-grid"
    >
      <SpielwieseModelPickerProviderPane
        currentProviderId={provider?.id ?? null}
        setHoveredModelLabel={setHoveredModelLabel}
        setProviderId={setProviderId}
      />
      <SpielwieseModelPickerSelectionPane
        closeOnSelect={closeOnSelect}
        currentModel={currentModel}
        onClose={onClose}
        onValueChange={onValueChange}
        previewModel={previewModel}
        provider={provider}
        setHoveredModelLabel={setHoveredModelLabel}
        visibleModels={visibleModels}
      />
    </div>
  );
}

function AnthropicApiKeyConsoleLink() {
  return (
    <a
      className="underline decoration-black/16 underline-offset-3 transition-opacity duration-150 hover:opacity-72"
      href={anthropicApiKeyHref}
      rel="noreferrer"
      target="_blank"
    >
      Link
    </a>
  );
}

function AnthropicApiKeyContinueButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8 w-full items-center justify-center rounded-lg border px-3 text-[0.8125rem]/4 font-medium tracking-[-0.01em] transition-[opacity,border-color,background-color,color,box-shadow] sm:w-auto",
        disabled
          ? "border-[rgba(15,23,42,0.05)] bg-[rgba(244,244,245,0.96)] text-[rgba(36,37,41,0.42)] shadow-none"
          : "border-[rgb(57,114,243)] bg-[rgb(57,114,243)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_18px_rgba(57,114,243,0.24)] hover:opacity-92",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span>Continue</span>
    </button>
  );
}

function SpielwieseAnthropicApiKeyPane({
  apiKeyPaneAnimationDelayMs,
  apiKeyPaneAnimationDurationMs,
  anthropicApiKeyValue,
  currentModel,
  onAnthropicApiKeyChange,
  onAnthropicApiKeyContinue,
}: {
  apiKeyPaneAnimationDelayMs?: number;
  apiKeyPaneAnimationDurationMs?: number;
  anthropicApiKeyValue: string;
  currentModel: string;
  onAnthropicApiKeyChange: (value: string) => void;
  onAnthropicApiKeyContinue?: () => void;
}) {
  const isContinueDisabled =
    anthropicApiKeyValue.trim().length === 0 || !onAnthropicApiKeyContinue;

  return (
    <div
      className={spielwieseModelPickerAnthropicApiKeyPaneClassName}
      data-testid="spielwiese-model-picker-api-key-pane"
      style={{
        ...getModelPickerAnimationStyle({
          valueMs: apiKeyPaneAnimationDelayMs,
          variableName: "--spielwiese-picker-pane-delay",
        }),
        ...getModelPickerAnimationStyle({
          valueMs: apiKeyPaneAnimationDurationMs,
          variableName: "--spielwiese-picker-pane-duration",
        }),
      }}
    >
      <div className="grid gap-1">
        <p className="text-[0.8125rem]/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)]">
          Connect {currentModel} with your Anthropic key.{" "}
          <AnthropicApiKeyConsoleLink />
        </p>
      </div>
      <div
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        data-testid="spielwiese-model-picker-api-key-row"
      >
        <input
          aria-label="Anthropic API key"
          className="h-8 w-full min-w-0 rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-[rgba(251,251,251,0.98)] px-3 text-[0.8125rem]/4 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] transition-[border-color,box-shadow] outline-none focus:border-[rgba(15,23,42,0.12)] focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_0_0_3px_rgba(15,23,42,0.04)]"
          onChange={(event) => onAnthropicApiKeyChange(event.target.value)}
          placeholder="sk-ant-api03-..."
          type="password"
          value={anthropicApiKeyValue}
        />
        <AnthropicApiKeyContinueButton
          disabled={isContinueDisabled}
          onClick={onAnthropicApiKeyContinue}
        />
      </div>
    </div>
  );
}

export function SpielwieseModelPickerContents({
  anthropicApiKeyValue = "",
  apiKeyPaneAnimationDelayMs,
  apiKeyPaneAnimationDurationMs,
  closeOnSelect,
  currentModel,
  hoveredModelLabel,
  onClose,
  onAnthropicApiKeyChange,
  onAnthropicApiKeyContinue,
  onValueChange,
  providerId,
  setHoveredModelLabel,
  setProviderId,
  showAnthropicApiKeyPrompt = false,
}: SpielwieseModelPickerProps) {
  if (showAnthropicApiKeyPrompt && onAnthropicApiKeyChange) {
    return (
      <SpielwieseAnthropicApiKeyPane
        apiKeyPaneAnimationDelayMs={apiKeyPaneAnimationDelayMs}
        apiKeyPaneAnimationDurationMs={apiKeyPaneAnimationDurationMs}
        anthropicApiKeyValue={anthropicApiKeyValue}
        currentModel={currentModel}
        onAnthropicApiKeyChange={onAnthropicApiKeyChange}
        onAnthropicApiKeyContinue={onAnthropicApiKeyContinue}
      />
    );
  }

  const provider = getSelectedProvider({ providerId });
  const visibleModels = getVisibleModels({ provider });
  const previewModel = getPreviewModel({ hoveredModelLabel });

  return (
    <SpielwieseModelPickerGrid
      closeOnSelect={closeOnSelect}
      currentModel={currentModel}
      onClose={onClose}
      onValueChange={onValueChange}
      previewModel={previewModel}
      provider={provider}
      setHoveredModelLabel={setHoveredModelLabel}
      setProviderId={setProviderId}
      visibleModels={visibleModels}
    />
  );
}

export function SpielwieseModelPickerPanel(props: SpielwieseModelPickerProps) {
  return (
    <div
      aria-label="Model picker"
      className={cn(spielwieseModelPickerPanelClassName)}
      data-testid="spielwiese-model-picker-panel"
      role="dialog"
      style={{
        ...getModelPickerAnimationStyle({
          valueMs: props.popoverAnimationDelayMs,
          variableName: "--spielwiese-picker-open-delay",
        }),
        ...getModelPickerAnimationStyle({
          valueMs: props.popoverAnimationDurationMs,
          variableName: "--spielwiese-picker-open-duration",
        }),
      }}
    >
      <SpielwieseModelPickerContents {...props} />
    </div>
  );
}

export { isCurrentModel, spielwieseModelPickerPanelClassName };
