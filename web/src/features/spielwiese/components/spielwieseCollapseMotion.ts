import { useRef, useState, type MutableRefObject } from "react";
import { cn } from "@/src/utils/tailwind";

const collapseCommitDelayMs = 90;
const collapseSettleDurationMs = 170;

export type SpielwieseCollapseMotionPhase = "idle" | "collapsing" | "expanding";

const spielwieseCollapseMotionClassName =
  "transform-gpu transition-[transform,opacity,filter] duration-170 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none";

function clearTimer(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  const currentTimer = timerRef.current;

  if (!currentTimer) {
    return null;
  }

  clearTimeout(currentTimer);

  return null;
}

export function getSpielwieseCollapseMotionClassName(
  phase: SpielwieseCollapseMotionPhase,
) {
  return cn(
    spielwieseCollapseMotionClassName,
    phase === "collapsing" && "scale-[0.994] opacity-[0.97]",
    phase === "expanding" && "translate-y-px scale-[0.988] opacity-[0.9]",
  );
}

export function useSpielwieseCollapseMotion({
  isCollapsed,
  onToggle,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const toggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<SpielwieseCollapseMotionPhase>("idle");

  const scheduleIdle = () => {
    settleTimerRef.current = clearTimer(settleTimerRef);
    settleTimerRef.current = setTimeout(() => {
      setPhase("idle");
      settleTimerRef.current = null;
    }, collapseSettleDurationMs);
  };

  const onToggleWithMotion = () => {
    toggleTimerRef.current = clearTimer(toggleTimerRef);
    settleTimerRef.current = clearTimer(settleTimerRef);

    if (isCollapsed) {
      onToggle();
      setPhase("expanding");
      scheduleIdle();
      return;
    }

    setPhase("collapsing");
    toggleTimerRef.current = setTimeout(() => {
      onToggle();
      setPhase("expanding");
      toggleTimerRef.current = null;
      scheduleIdle();
    }, collapseCommitDelayMs);
  };

  return {
    onToggleWithMotion,
    phase,
    transitionClassName: getSpielwieseCollapseMotionClassName(phase),
  };
}
