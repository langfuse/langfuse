import type { AnimationEvent, ReactNode } from "react";
import {
  type RoleStepScene,
  SpielwieseOnboardingQuestionPanel,
} from "./SpielwieseOnboardingQuestionPanel";
import { SpielwieseOnboardingProgress } from "./SpielwieseOnboardingProgress";
import SpielwieseOnboardingSurface from "./SpielwieseOnboardingSurface";
import {
  getOnboardingProgressValue,
  type OnboardingAnswerKey,
} from "../spielwieseOnboardingFlow";
import type { RoleHandoffTransition } from "../spielwieseRoleHandoff";

const onboardingCanvasStepMinHeightRem = 40;
const onboardingDefaultStepMinHeightRem = 34;
const onboardingContentOffsetYPx = -32;

function OnboardingStepProgressOverlay({
  isTransitioningOut,
  value,
}: {
  isTransitioningOut: boolean;
  value: number;
}) {
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 opacity-100 transition-opacity duration-[320ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${isTransitioningOut ? "opacity-0" : ""}`}
      >
        <SpielwieseOnboardingProgress value={value} />
      </div>
    </>
  );
}

function getOnboardingStepLayerClassName(isTransitioningOut: boolean) {
  return isTransitioningOut
    ? "animate-spielwiese-onboarding-scene-exit w-full pointer-events-none"
    : "w-full translate-y-0 opacity-100";
}

function getOnboardingStepShellClassName(showsUpperCanvas: boolean) {
  if (showsUpperCanvas) {
    return "flex min-h-[40rem] items-center max-w-[64rem] border-0 bg-transparent shadow-none";
  }

  return "flex min-h-[34rem] items-center border-0 bg-transparent shadow-none";
}

function getOnboardingStepShellMinHeight(showsUpperCanvas: boolean) {
  return `${showsUpperCanvas ? onboardingCanvasStepMinHeightRem : onboardingDefaultStepMinHeightRem}rem`;
}

function getRoleSceneProgressValue(roleScene: RoleStepScene) {
  switch (roleScene) {
    case "gate":
      return 24;
    case "bridge":
      return 36;
    case "preview":
      return 52;
    case "model-selection":
      return 68;
    case "api-key":
      return 84;
    case "handoff":
      return 92;
  }
}

function getOnboardingStepSceneProgressValue({
  activeQuestionId,
  roleScene,
}: {
  activeQuestionId: OnboardingAnswerKey;
  roleScene: RoleStepScene;
}) {
  return activeQuestionId === "role"
    ? getRoleSceneProgressValue(roleScene)
    : getOnboardingProgressValue(activeQuestionId);
}

// eslint-disable-next-line max-lines-per-function
function OnboardingStepQuestionLayer({
  activeAnswer,
  activeQuestionId,
  activeStepIndex,
  contentOffsetYPx,
  handleBack,
  handleContinue,
  handleRoleApiKeyChange,
  handleRoleBridgeAnimationEnd,
  handleRoleDashboardHandoffComplete,
  handleRoleModelChange,
  handleRoleSystemPromptChange,
  handleSelect,
  isQuestionActive,
  roleApiKeyValue,
  roleHandoffTransition,
  roleModelValue,
  roleScene,
  roleSystemPromptValue,
}: {
  activeAnswer: string;
  activeQuestionId: string;
  activeStepIndex: number;
  contentOffsetYPx: number;
  handleBack: () => void;
  handleContinue: () => void;
  handleRoleApiKeyChange: (value: string) => void;
  handleRoleBridgeAnimationEnd: (
    event: AnimationEvent<HTMLHeadingElement>,
  ) => void;
  handleRoleDashboardHandoffComplete: () => void;
  handleRoleModelChange: (value: string) => void;
  handleRoleSystemPromptChange: (value: string) => void;
  handleSelect: (value: string) => void;
  isQuestionActive: boolean;
  roleApiKeyValue: string;
  roleHandoffTransition: RoleHandoffTransition | null;
  roleModelValue: string;
  roleScene: RoleStepScene;
  roleSystemPromptValue: string;
}) {
  return (
    <div
      data-testid="spielwiese-onboarding-step-content"
      style={{
        transform: `translateY(${contentOffsetYPx}px)`,
      }}
    >
      <SpielwieseOnboardingQuestionPanel
        activeAnswer={activeAnswer}
        activeStepIndex={activeStepIndex}
        isActive={isQuestionActive}
        onBack={handleBack}
        onContinue={handleContinue}
        onRoleApiKeyChange={handleRoleApiKeyChange}
        onRoleBridgeAnimationEnd={handleRoleBridgeAnimationEnd}
        onRoleDashboardHandoffComplete={handleRoleDashboardHandoffComplete}
        onRoleModelChange={handleRoleModelChange}
        onRoleSystemPromptChange={handleRoleSystemPromptChange}
        onSelect={handleSelect}
        roleApiKeyValue={roleApiKeyValue}
        roleHandoffTransition={roleHandoffTransition}
        roleModelValue={roleModelValue}
        roleSystemPromptValue={roleSystemPromptValue}
        roleScene={activeQuestionId === "role" ? roleScene : "preview"}
      />
    </div>
  );
}

function OnboardingStepSurfaceFrame({
  activeQuestionId,
  isTransitioningOut,
  minHeight,
  roleScene,
  showsUpperCanvas,
  children,
}: {
  activeQuestionId: OnboardingAnswerKey;
  children: ReactNode;
  isTransitioningOut: boolean;
  minHeight: string;
  roleScene: RoleStepScene;
  showsUpperCanvas: boolean;
}) {
  return (
    <SpielwieseOnboardingSurface
      footer={null}
      header={null}
      layout="single"
      sectionClassName="pt-0 sm:pt-0"
      shellClassName={getOnboardingStepShellClassName(showsUpperCanvas)}
      shellStyle={{ minHeight }}
      stageClassName={showsUpperCanvas ? "max-w-[66rem]" : undefined}
      showBackdrop={false}
      testId="spielwiese-onboarding-step"
      topOverlay={
        <OnboardingStepProgressOverlay
          isTransitioningOut={isTransitioningOut}
          value={getOnboardingStepSceneProgressValue({
            activeQuestionId,
            roleScene,
          })}
        />
      }
    >
      {children}
    </SpielwieseOnboardingSurface>
  );
}

type SpielwieseOnboardingStepSceneProps = {
  activeAnswer: string;
  activeQuestionId: OnboardingAnswerKey;
  activeStepIndex: number;
  handleBack: () => void;
  handleContinue: () => void;
  handleRoleApiKeyChange: (value: string) => void;
  handleRoleBridgeAnimationEnd: (
    event: AnimationEvent<HTMLHeadingElement>,
  ) => void;
  handleRoleDashboardHandoffComplete: () => void;
  handleRoleModelChange: (value: string) => void;
  handleRoleSystemPromptChange: (value: string) => void;
  handleSelect: (value: string) => void;
  handleStepLayerAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
  isQuestionActive?: boolean;
  isStepTransitioningOut: boolean;
  roleApiKeyValue: string;
  roleHandoffTransition: RoleHandoffTransition | null;
  roleModelValue: string;
  roleSystemPromptValue: string;
  roleScene: RoleStepScene;
  showsUpperCanvas: boolean;
};

export function SpielwieseOnboardingStepScene({
  activeAnswer,
  activeQuestionId,
  activeStepIndex,
  handleBack,
  handleContinue,
  handleRoleApiKeyChange,
  handleRoleBridgeAnimationEnd,
  handleRoleDashboardHandoffComplete: handleHandoffComplete,
  handleRoleModelChange,
  handleRoleSystemPromptChange,
  handleSelect,
  handleStepLayerAnimationEnd,
  isQuestionActive,
  isStepTransitioningOut,
  roleApiKeyValue,
  roleHandoffTransition,
  roleModelValue,
  roleSystemPromptValue,
  roleScene,
  showsUpperCanvas,
}: SpielwieseOnboardingStepSceneProps) {
  return (
    <OnboardingStepSurfaceFrame
      activeQuestionId={activeQuestionId}
      isTransitioningOut={isStepTransitioningOut}
      minHeight={getOnboardingStepShellMinHeight(showsUpperCanvas)}
      roleScene={roleScene}
      showsUpperCanvas={showsUpperCanvas}
    >
      <div
        className={getOnboardingStepLayerClassName(isStepTransitioningOut)}
        data-testid="spielwiese-onboarding-step-layer"
        onAnimationEnd={handleStepLayerAnimationEnd}
      >
        <OnboardingStepQuestionLayer
          activeAnswer={activeAnswer}
          activeQuestionId={activeQuestionId}
          activeStepIndex={activeStepIndex}
          contentOffsetYPx={onboardingContentOffsetYPx}
          handleBack={handleBack}
          handleContinue={handleContinue}
          handleRoleApiKeyChange={handleRoleApiKeyChange}
          handleRoleBridgeAnimationEnd={handleRoleBridgeAnimationEnd}
          handleRoleDashboardHandoffComplete={handleHandoffComplete}
          handleRoleModelChange={handleRoleModelChange}
          handleRoleSystemPromptChange={handleRoleSystemPromptChange}
          handleSelect={handleSelect}
          isQuestionActive={isQuestionActive ?? !isStepTransitioningOut}
          roleApiKeyValue={roleApiKeyValue}
          roleHandoffTransition={roleHandoffTransition}
          roleModelValue={roleModelValue}
          roleScene={roleScene}
          roleSystemPromptValue={roleSystemPromptValue}
        />
      </div>
    </OnboardingStepSurfaceFrame>
  );
}
