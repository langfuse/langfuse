import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  spielwieseHeaderButtonBaseClassName,
  spielwieseHeaderButtonSelectedClassName,
  spielwieseHeaderButtonStaticClassName,
} from "./spielwieseHeaderButtonStyles";

export type SpielwieseDashboardDebugState = {
  playgroundHeaderPadX: number;
  playgroundSurfacePadX: number;
  showPlaygroundFlowNodeActions: boolean;
};

export const defaultSpielwieseDashboardDebugState: SpielwieseDashboardDebugState =
  {
    playgroundHeaderPadX: 8,
    playgroundSurfacePadX: 10,
    showPlaygroundFlowNodeActions: true,
  };

const debugHudRangeMax = 24;
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
          onChange={(event) => onChange(getDebugPxValue(event.target.value, value))}
          type="range"
          value={value}
        />
      </label>
      <Input
        aria-label={`${label} value`}
        className="h-7 px-2 text-center text-xs font-medium tabular-nums"
        max={debugHudRangeMax}
        min={debugHudRangeMin}
        onChange={(event) => onChange(getDebugPxValue(event.target.value, value))}
        type="number"
        value={value}
      />
    </div>
  );
}

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
        className="pointer-events-auto flex w-[18rem] flex-col gap-3 rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.94)] p-3 shadow-[0_18px_45px_rgba(15,23,42,0.14),0_4px_14px_rgba(15,23,42,0.08)] backdrop-blur-md"
        data-testid="spielwiese-dashboard-debug-hud"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="flex size-7 items-center justify-center rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[rgba(247,247,247,0.92)] text-[#202427]">
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            </span>
            <div>
              <div className="text-[11px] font-semibold tracking-[0.12em] uppercase">
                Layout HUD
              </div>
              <div className="text-foreground/58 text-[11px]">
                Lower playground only
              </div>
            </div>
          </div>
          <Button
            aria-label="Reset layout HUD"
            className={`${spielwieseHeaderButtonBaseClassName} inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] p-0`}
            size="icon-sm"
            variant="ghost"
            onClick={() => onChange(defaultSpielwieseDashboardDebugState)}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

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

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-foreground/54 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Flow Actions
            </div>
            <div className="text-foreground/58 text-[11px]">
              Lower card header buttons
            </div>
          </div>
          <Button
            aria-label={
              state.showPlaygroundFlowNodeActions
                ? "Hide flow header actions"
                : "Show flow header actions"
            }
            aria-pressed={state.showPlaygroundFlowNodeActions}
            className={`inline-flex h-7 rounded-[10px] px-2.5 text-[11px] font-medium ${
              state.showPlaygroundFlowNodeActions
                ? `${spielwieseHeaderButtonStaticClassName} ${spielwieseHeaderButtonSelectedClassName}`
                : spielwieseHeaderButtonBaseClassName
            }`}
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({
                ...state,
                showPlaygroundFlowNodeActions:
                  !state.showPlaygroundFlowNodeActions,
              })
            }
          >
            {state.showPlaygroundFlowNodeActions ? "Visible" : "Hidden"}
          </Button>
        </div>
      </section>
    </div>
  );
}
