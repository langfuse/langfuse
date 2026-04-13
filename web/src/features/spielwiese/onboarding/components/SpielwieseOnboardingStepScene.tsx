import type { AnimationEvent } from "react";
import {
  preventInertOnboardingClick,
  SpielwieseOnboardingFooter,
} from "./SpielwieseOnboardingFooter";
import {
  type RoleStepScene,
  SpielwieseOnboardingQuestionPanel,
} from "./SpielwieseOnboardingQuestionPanel";
import { SpielwieseOnboardingProgress } from "./SpielwieseOnboardingProgress";
import SpielwieseOnboardingSurface from "./SpielwieseOnboardingSurface";
import SpielwieseOnboardingWordmarkButton from "./SpielwieseOnboardingWordmark";
import { getOnboardingProgressValue } from "../spielwieseOnboardingFlow";

function OnboardingStepProgressOverlay({ value }: { value: number }) {
  return (
    <div className="absolute inset-x-0 top-0 opacity-100 transition-opacity duration-[320ms] ease-[cubic-bezier(0.23,1,0.32,1)]">
      <SpielwieseOnboardingProgress value={value} />
    </div>
  );
}

function getOnboardingStepLayerClassName(isTransitioningOut: boolean) {
  return isTransitioningOut
    ? "animate-spielwiese-onboarding-scene-exit w-full pointer-events-none"
    : "w-full translate-y-0 opacity-100";
}

type SpielwieseOnboardingStepSceneProps = {
  activeAnswer: string;
  activeQuestionId: string;
  activeStepIndex: number;
  handleBack: () => void;
  handleContinue: () => void;
  handleRoleApiKeyChange: (value: string) => void;
  handleRoleBridgeAnimationEnd: (
    event: AnimationEvent<HTMLHeadingElement>,
  ) => void;
  handleRoleModelChange: (value: string) => void;
  handleRoleSystemPromptChange: (value: string) => void;
  handleSelect: (value: string) => void;
  handleStepLayerAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
  isStepTransitioningOut: boolean;
  roleApiKeyValue: string;
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
  handleRoleModelChange,
  handleRoleSystemPromptChange,
  handleSelect,
  handleStepLayerAnimationEnd,
  isStepTransitioningOut,
  roleApiKeyValue,
  roleModelValue,
  roleSystemPromptValue,
  roleScene,
  showsUpperCanvas,
}: SpielwieseOnboardingStepSceneProps) {
  return (
    <SpielwieseOnboardingSurface
      footer={<SpielwieseOnboardingFooter />}
      header={
        <SpielwieseOnboardingWordmarkButton
          onClick={preventInertOnboardingClick}
        />
      }
      layout="single"
      shellClassName={
        showsUpperCanvas
          ? "max-w-[70.625rem] border-0 bg-transparent shadow-none"
          : "border-0 bg-transparent shadow-none"
      }
      stageClassName={showsUpperCanvas ? "max-w-[72.625rem]" : undefined}
      showBackdrop={false}
      testId="spielwiese-onboarding-step"
      topOverlay={
        <OnboardingStepProgressOverlay
          value={getOnboardingProgressValue(activeQuestionId)}
        />
      }
    >
      <div
        className={getOnboardingStepLayerClassName(isStepTransitioningOut)}
        data-testid="spielwiese-onboarding-step-layer"
        onAnimationEnd={handleStepLayerAnimationEnd}
      >
        <SpielwieseOnboardingQuestionPanel
          activeAnswer={activeAnswer}
          activeStepIndex={activeStepIndex}
          onBack={handleBack}
          onContinue={handleContinue}
          onRoleApiKeyChange={handleRoleApiKeyChange}
          onRoleBridgeAnimationEnd={handleRoleBridgeAnimationEnd}
          onRoleModelChange={handleRoleModelChange}
          onRoleSystemPromptChange={handleRoleSystemPromptChange}
          onSelect={handleSelect}
          roleApiKeyValue={roleApiKeyValue}
          roleModelValue={roleModelValue}
          roleSystemPromptValue={roleSystemPromptValue}
          roleScene={activeQuestionId === "role" ? roleScene : "preview"}
        />
      </div>
    </SpielwieseOnboardingSurface>
  );
}
