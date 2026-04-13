/* eslint-disable max-lines */
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  spielwieseAgentNodeColorHudSections,
  spielwieseAgentNodeColorPalette,
  spielwieseAgentNodeChromeHudItems,
  spielwieseAgentNodeChromeSettings,
  type SpielwieseAgentNodeChromeSettingsState,
  type SpielwieseAgentNodeColorState,
} from "./spielwieseAgentNodeColorPalette";
import {
  spielwieseHeaderButtonBaseClassName,
  spielwieseHeaderButtonSelectedClassName,
  spielwieseHeaderButtonStaticClassName,
} from "./spielwieseHeaderButtonStyles";

export type SpielwieseDashboardDebugState = {
  nodeChrome: SpielwieseAgentNodeChromeSettingsState;
  nodeColors: SpielwieseAgentNodeColorState;
  playgroundHeaderPadX: number;
  playgroundSurfacePadX: number;
  showPlaygroundFlowNodeActions: boolean;
};

export const defaultSpielwieseDashboardDebugState: SpielwieseDashboardDebugState =
  {
    nodeChrome: { ...spielwieseAgentNodeChromeSettings },
    nodeColors: { ...spielwieseAgentNodeColorPalette },
    playgroundHeaderPadX: 8,
    playgroundSurfacePadX: 44,
    showPlaygroundFlowNodeActions: true,
  };

const debugHudRangeMax = 64;
const debugHudRangeMin = 0;

function clampDebugPxValue(value: number) {
  return Math.min(
    debugHudRangeMax,
    Math.max(debugHudRangeMin, Math.round(value)),
  );
}

function getDebugPxValue(value: string, fallback: number) {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue)
    ? clampDebugPxValue(parsedValue)
    : fallback;
}

function DebugHudSliderRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (nextValue: number) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2">
      <label className="min-w-0" htmlFor={id}>
        <div className="text-foreground/54 text-[10px] font-semibold tracking-[0.14em] uppercase">
          {label}
        </div>
        <input
          aria-label={label}
          className="mt-1 h-2 w-full cursor-pointer accent-[#202427]"
          id={id}
          max={debugHudRangeMax}
          min={debugHudRangeMin}
          onChange={(event) =>
            onChange(getDebugPxValue(event.target.value, value))
          }
          type="range"
          value={value}
        />
      </label>
      <Input
        aria-label={`${label} value`}
        className="h-7 px-2 text-center text-xs font-medium tabular-nums"
        max={debugHudRangeMax}
        min={debugHudRangeMin}
        onChange={(event) =>
          onChange(getDebugPxValue(event.target.value, value))
        }
        type="number"
        value={value}
      />
    </div>
  );
}

function DebugHudHeader({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className="flex size-7 items-center justify-center rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[rgba(247,247,247,0.92)] text-[#202427]">
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
        </span>
        <div>
          <div className="text-[11px] font-semibold tracking-[0.12em] uppercase">
            Debug HUD
          </div>
          <div className="text-foreground/58 text-[11px]">
            Playground and agent node chrome
          </div>
        </div>
      </div>
      <Button
        aria-label="Reset debug HUD"
        className={`${spielwieseHeaderButtonBaseClassName} inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] p-0`}
        size="icon-sm"
        variant="ghost"
        onClick={onReset}
      >
        <RotateCcw aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );
}

// eslint-disable-next-line complexity
function DebugHudActionToggle({
  activeAriaLabel,
  label = "Flow Actions",
  offLabel = "Hidden",
  offSubcopy,
  isVisible,
  inactiveAriaLabel,
  onLabel = "Visible",
  onToggle,
  subcopy = "Lower card header buttons",
}: {
  activeAriaLabel?: string;
  isVisible: boolean;
  inactiveAriaLabel?: string;
  label?: string;
  offLabel?: string;
  offSubcopy?: string;
  onToggle: () => void;
  onLabel?: string;
  subcopy?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-foreground/54 text-[10px] font-semibold tracking-[0.14em] uppercase">
          {label}
        </div>
        <div className="text-foreground/58 text-[11px]">
          {isVisible ? subcopy : offSubcopy ?? subcopy}
        </div>
      </div>
      <Button
        aria-label={
          isVisible
            ? activeAriaLabel ?? "Hide flow header actions"
            : inactiveAriaLabel ?? "Show flow header actions"
        }
        aria-pressed={isVisible}
        className={`inline-flex h-7 rounded-[10px] px-2.5 text-[11px] font-medium ${
          isVisible
            ? `${spielwieseHeaderButtonStaticClassName} ${spielwieseHeaderButtonSelectedClassName}`
            : spielwieseHeaderButtonBaseClassName
        }`}
        size="sm"
        variant="ghost"
        onClick={onToggle}
      >
        {isVisible ? onLabel : offLabel}
      </Button>
    </div>
  );
}

function DebugHudColorRow({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (nextValue: string) => void;
  value: string;
}) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_8.25rem] items-center gap-2"
      data-testid={`spielwiese-dashboard-debug-hud-color-row-${id}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="size-5 shrink-0 rounded-[7px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]"
          style={{ backgroundColor: value }}
        />
        <div className="min-w-0">
          <div className="text-foreground/54 text-[10px] font-semibold tracking-[0.14em] uppercase">
            {label}
          </div>
        </div>
      </div>
      <Input
        aria-label={`${label} color`}
        className="h-7 px-2 text-[11px] font-medium tabular-nums"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function DebugHudColorSection({
  nodeColors,
  onColorChange,
}: {
  nodeColors: SpielwieseAgentNodeColorState;
  onColorChange: (
    key: keyof SpielwieseAgentNodeColorState,
    value: string,
  ) => void;
}) {
  return (
    <div
      className="grid gap-3"
      data-testid="spielwiese-dashboard-debug-hud-color-section"
    >
      <div>
        <div className="text-foreground/54 text-[10px] font-semibold tracking-[0.14em] uppercase">
          Agent Node Colors
        </div>
        <div className="text-foreground/58 text-[11px]">
          Source-of-truth chrome palette for the primary node
        </div>
      </div>
      {spielwieseAgentNodeColorHudSections.map((section) => (
        <div
          className="grid gap-2"
          data-testid={`spielwiese-dashboard-debug-hud-color-group-${section.id}`}
          key={section.id}
        >
          <div className="text-foreground/48 text-[10px] font-semibold tracking-[0.12em] uppercase">
            {section.title}
          </div>
          {section.items.map((item) => (
            <DebugHudColorRow
              id={item.id}
              key={item.id}
              label={item.label}
              onChange={(nextValue) => onColorChange(item.key, nextValue)}
              value={nodeColors[item.key]}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DebugHudChromeSection({
  nodeChrome,
  onChromeToggle,
}: {
  nodeChrome: SpielwieseAgentNodeChromeSettingsState;
  onChromeToggle: (key: keyof SpielwieseAgentNodeChromeSettingsState) => void;
}) {
  return (
    <div
      className="grid gap-3"
      data-testid="spielwiese-dashboard-debug-hud-chrome-section"
    >
      <div>
        <div className="text-foreground/54 text-[10px] font-semibold tracking-[0.14em] uppercase">
          Agent Node Chrome
        </div>
        <div className="text-foreground/58 text-[11px]">
          Structural toggles for the primary card only
        </div>
      </div>
      {spielwieseAgentNodeChromeHudItems.map((item) => (
        <DebugHudActionToggle
          activeAriaLabel={`Disable ${item.label.toLowerCase()}`}
          isVisible={nodeChrome[item.key]}
          inactiveAriaLabel={`Enable ${item.label.toLowerCase()}`}
          key={item.key}
          label={item.label}
          offLabel="Off"
          onLabel="On"
          onToggle={() => onChromeToggle(item.key)}
          subcopy={item.description}
        />
      ))}
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
export function SpielwieseDashboardDebugHud({
  state,
  onChange,
}: {
  onChange: (nextState: SpielwieseDashboardDebugState) => void;
  state: SpielwieseDashboardDebugState;
}) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] hidden sm:block">
      <section
        className="pointer-events-auto flex max-h-[calc(100vh-2rem)] w-[18rem] flex-col gap-3 overflow-y-auto rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.94)] p-3 shadow-[0_18px_45px_rgba(15,23,42,0.14),0_4px_14px_rgba(15,23,42,0.08)] backdrop-blur-md"
        data-testid="spielwiese-dashboard-debug-hud"
      >
        <DebugHudHeader
          onReset={() => onChange(defaultSpielwieseDashboardDebugState)}
        />
        <DebugHudSliderRow
          id="spielwiese-debug-playground-surface-pad-x"
          label="Canvas Body X"
          value={state.playgroundSurfacePadX}
          onChange={(nextValue) =>
            onChange({
              ...state,
              playgroundSurfacePadX: nextValue,
            })
          }
        />
        <DebugHudSliderRow
          id="spielwiese-debug-playground-header-pad-x"
          label="Header X"
          value={state.playgroundHeaderPadX}
          onChange={(nextValue) =>
            onChange({
              ...state,
              playgroundHeaderPadX: nextValue,
            })
          }
        />
        <DebugHudActionToggle
          activeAriaLabel="Hide flow header actions"
          isVisible={state.showPlaygroundFlowNodeActions}
          inactiveAriaLabel="Show flow header actions"
          onToggle={() =>
            onChange({
              ...state,
              showPlaygroundFlowNodeActions:
                !state.showPlaygroundFlowNodeActions,
            })
          }
        />
        <div className="h-px bg-[rgba(0,0,0,0.08)]" />
        <DebugHudChromeSection
          nodeChrome={state.nodeChrome}
          onChromeToggle={(key) =>
            onChange({
              ...state,
              nodeChrome: {
                ...state.nodeChrome,
                [key]: !state.nodeChrome[key],
              },
            })
          }
        />
        <div className="h-px bg-[rgba(0,0,0,0.08)]" />
        <DebugHudColorSection
          nodeColors={state.nodeColors}
          onColorChange={(key, value) =>
            onChange({
              ...state,
              nodeColors: {
                ...state.nodeColors,
                [key]: value,
              },
            })
          }
        />
      </section>
    </div>
  );
}
