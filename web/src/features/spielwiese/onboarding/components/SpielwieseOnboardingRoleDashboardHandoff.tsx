"use client";

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { SpielwieseEditorCanvas } from "../../components/SpielwieseEditorCanvas";
import { SpielwieseVariableValuesProvider } from "../../components/useSpielwieseVariableValues";
import { useSpielwieseVariablesPanelState } from "../../components/useSpielwieseVariablesPanelState";
import { SpielwieseDashboardShell } from "../../shell/SpielwieseDashboardShell";
import {
  getRoleFlowOnboardingDashboard,
  getSpielwieseShellVm,
  spielwieseDashboardRootClassName,
  spielwieseDashboardRootStyle,
} from "../../spielwieseDashboardRoleFlow";
import type {
  RoleHandoffSnapshot,
  RoleHandoffTransition,
} from "../spielwieseRoleHandoff";
import {
  getRoleHandoffMotionTiming,
  useRoleHandoffMotion,
} from "./spielwieseRoleDashboardHandoffMotion";
import { getRoleHandoffDebugConfig } from "./spielwieseRoleDashboardHandoffTuning";

const modalTransition =
  "opacity 260ms cubic-bezier(0.23,1,0.32,1), transform 260ms cubic-bezier(0.23,1,0.32,1), filter 260ms cubic-bezier(0.23,1,0.32,1)";
const handoffMotionTiming = getRoleHandoffMotionTiming();
const cardTransition =
  `transform ${handoffMotionTiming.cardLiftDuration}ms cubic-bezier(0.22,1,0.36,1), ` +
  `opacity ${handoffMotionTiming.cardFadeDuration}ms cubic-bezier(0.23,1,0.32,1)`;
const veilTransition = `opacity ${handoffMotionTiming.veilFadeDuration}ms cubic-bezier(0.23,1,0.32,1)`;

function getModalTransform(isFading: boolean) {
  return isFading
    ? "translate3d(0,-10px,0) scale(0.985)"
    : "translate3d(0,0,0) scale(1)";
}

function getNodeTransform({
  cardLiftDistanceY,
  cardShrinkInsetX,
  isLifted,
  width,
}: {
  cardLiftDistanceY: number;
  cardShrinkInsetX: number;
  isLifted: boolean;
  width: number;
}) {
  if (!isLifted) {
    return "translate3d(0,0,0) scale(1)";
  }

  const shrinkRatio = Math.max((width - cardShrinkInsetX * 2) / width, 0.1);

  return `translate3d(0, -${cardLiftDistanceY}px, 0) scaleX(${shrinkRatio})`;
}

function getCloneStyle({
  filter,
  opacity,
  rect,
  transform,
  transformOrigin = "top left",
  transition,
}: {
  filter?: string;
  opacity: number;
  rect: RoleHandoffSnapshot["sourceNodeRect"];
  transform: string;
  transformOrigin?: string;
  transition: string;
}): React.CSSProperties {
  return {
    filter,
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    maxWidth: `${rect.width}px`,
    opacity,
    pointerEvents: "none",
    position: "fixed",
    top: `${rect.top}px`,
    transform,
    transformOrigin,
    transition,
    width: `${rect.width}px`,
    willChange: "transform, opacity, filter",
  };
}

function HandoffCloneLayer({
  html,
  rect,
  style,
  testId,
  transformOrigin,
}: {
  html: string;
  rect: RoleHandoffSnapshot["sourceNodeRect"];
  style: Pick<
    React.CSSProperties,
    "filter" | "opacity" | "transform" | "transition"
  >;
  testId: string;
  transformOrigin?: string;
}) {
  return (
    <div
      className="pointer-events-none"
      data-testid={testId}
      style={getCloneStyle({
        filter: style.filter,
        opacity: style.opacity ?? 1,
        rect,
        transform: style.transform ?? "translate3d(0,0,0) scale(1)",
        transformOrigin,
        transition: style.transition ?? "none",
      })}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function HandoffDashboardBackground({
  backgroundRootRef,
  dashboard,
  shell,
  variablesState,
}: {
  backgroundRootRef: React.RefObject<HTMLDivElement | null>;
  dashboard: ReturnType<typeof getRoleFlowOnboardingDashboard>;
  shell: ReturnType<typeof getSpielwieseShellVm>;
  variablesState: ReturnType<typeof useSpielwieseVariablesPanelState>;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none"
      data-testid="spielwiese-onboarding-role-dashboard-handoff-shell"
      ref={backgroundRootRef}
    >
      <SpielwieseVariableValuesProvider items={variablesState.items}>
        <SpielwieseDashboardShell
          dashboard={dashboard}
          shell={shell}
          variablesState={variablesState}
        >
          <SpielwieseEditorCanvas
            canvas={dashboard.canvas}
            onDetectedVariablesChange={variablesState.onEnsureDetectedVariables}
          />
        </SpielwieseDashboardShell>
      </SpielwieseVariableValuesProvider>
    </div>
  );
}

function HandoffCloneStack({
  debugConfig,
  motion,
  transition,
}: {
  debugConfig: ReturnType<typeof getRoleHandoffDebugConfig>;
  motion: ReturnType<typeof useRoleHandoffMotion>;
  transition: RoleHandoffTransition;
}) {
  const cardTransform = getNodeTransform({
    cardLiftDistanceY: debugConfig.cardLiftDistanceY,
    cardShrinkInsetX: debugConfig.cardShrinkInsetX,
    isLifted: motion.isCardLifted,
    width: transition.snapshot.sourceNodeRect.width,
  });

  return (
    <>
      {motion.showsVeil ? (
        <div
          className="pointer-events-none fixed inset-0 z-[226] bg-white"
          data-testid="spielwiese-onboarding-role-dashboard-handoff-veil"
          style={{
            opacity: motion.isVeilFading ? 0 : 1,
            transition: veilTransition,
          }}
        />
      ) : null}
      <div className="pointer-events-none fixed inset-0 z-[232]">
        <HandoffCloneLayer
          html={transition.markup.nodeHtml}
          rect={transition.snapshot.sourceNodeRect}
          style={{
            opacity: motion.isCardFading ? 0 : 1,
            transform: cardTransform,
            transition: cardTransition,
          }}
          testId="spielwiese-onboarding-role-dashboard-handoff-node"
          transformOrigin="center top"
        />
      </div>
      {motion.showsModal ? (
        <div className="pointer-events-none fixed inset-0 z-[236]">
          <HandoffCloneLayer
            html={transition.markup.modalHtml}
            rect={transition.snapshot.sourceModalRect}
            style={{
              filter: motion.isModalFading ? "blur(8px)" : "blur(0px)",
              opacity: motion.isModalFading ? 0 : 1,
              transform: getModalTransform(motion.isModalFading),
              transition: modalTransition,
            }}
            testId="spielwiese-onboarding-role-dashboard-handoff-modal"
          />
        </div>
      ) : null}
    </>
  );
}

type SpielwieseOnboardingRoleDashboardHandoffProps = {
  modelValue: string;
  onComplete: () => void;
  systemPromptValue: string;
  transition: RoleHandoffTransition;
};

export function SpielwieseOnboardingRoleDashboardHandoff({
  modelValue,
  onComplete,
  systemPromptValue,
  transition,
}: SpielwieseOnboardingRoleDashboardHandoffProps) {
  const backgroundRootRef = useRef<HTMLDivElement | null>(null);
  const debugConfig = getRoleHandoffDebugConfig();
  const dashboard = getRoleFlowOnboardingDashboard({
    modelValue,
    systemPromptValue,
  });
  const shell = getSpielwieseShellVm("assistant");
  const portalTarget = typeof document === "undefined" ? null : document.body;
  const variablesState = useSpielwieseVariablesPanelState(
    dashboard.variablesPanel.items,
  );
  const motion = useRoleHandoffMotion({
    freezeAtLift: debugConfig.freezeAtLift,
    onComplete,
    targetNodeId: transition.snapshot.targetNodeId,
    targetRootRef: backgroundRootRef,
  });

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className={`${spielwieseDashboardRootClassName} fixed inset-0 z-[220]`}
      data-testid="spielwiese-onboarding-role-dashboard-handoff"
      style={spielwieseDashboardRootStyle}
    >
      <HandoffDashboardBackground
        backgroundRootRef={backgroundRootRef}
        dashboard={dashboard}
        shell={shell}
        variablesState={variablesState}
      />
      <HandoffCloneStack
        debugConfig={debugConfig}
        motion={motion}
        transition={transition}
      />
    </div>,
    portalTarget,
  );
}
