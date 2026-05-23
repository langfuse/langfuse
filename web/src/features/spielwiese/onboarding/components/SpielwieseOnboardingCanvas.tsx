/* eslint-disable max-lines */
import type { AnimationEvent, Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { useRouter } from "next/router";
import { type RoleStepScene } from "./SpielwieseOnboardingQuestionPanel";
import { SpielwieseOnboardingStepScene } from "./SpielwieseOnboardingStepScene";
import {
  appendCurrentSearchParams,
  EMPTY_ONBOARDING_ANSWERS,
  getActiveOnboardingStepIndex,
  getSpielwieseDashboardPath,
  getOnboardingStepPath,
  ONBOARDING_QUESTIONS,
} from "../spielwieseOnboardingFlow";
import { setOnboardingDashboardHandoff } from "../spielwieseOnboardingDashboardHandoff";
import { useSpielwieseRouteTransition } from "../../spielwieseRouteTransition";

type SpielwieseOnboardingCanvasProps = {
  requestedStepId?: string;
};

type StepExitAction =
  | {
      kind: "navigate";
      path: string;
    }
  | {
      kind: "show-role-bridge";
    };
type OnboardingAnswers = typeof EMPTY_ONBOARDING_ANSWERS;

function getPreviousOnboardingPath(activeStepIndex: number) {
  const previousQuestion = ONBOARDING_QUESTIONS[activeStepIndex - 1];

  return previousQuestion ? getOnboardingStepPath(previousQuestion.id) : null;
}

function getNextOnboardingPath(activeStepIndex: number) {
  const nextQuestion = ONBOARDING_QUESTIONS[activeStepIndex + 1];

  return nextQuestion
    ? getOnboardingStepPath(nextQuestion.id)
    : getSpielwieseDashboardPath();
}

function createOnboardingBackHandler(
  activeStepIndex: number,
  isStepTransitioningOut: boolean,
) {
  const previousPath = getPreviousOnboardingPath(activeStepIndex);

  return () => {
    if (isStepTransitioningOut || !previousPath) {
      return;
    }

    return {
      kind: "navigate" as const,
      path: previousPath,
    };
  };
}

function createOnboardingContinueHandler({
  activeAnswer,
  activeStepIndex,
  isStepTransitioningOut,
  roleScene,
}: {
  activeAnswer: string;
  activeStepIndex: number;
  isStepTransitioningOut: boolean;
  roleScene: RoleStepScene;
}) {
  const nextPath = getNextOnboardingPath(activeStepIndex);

  return () => {
    if (!activeAnswer || isStepTransitioningOut) {
      return null;
    }

    if (activeStepIndex === 0 && roleScene === "gate") {
      return {
        kind: "show-role-bridge" as const,
      };
    }

    return {
      kind: "navigate" as const,
      path: nextPath,
    };
  };
}

function createOnboardingSelectHandler({
  activeQuestionId,
  setAnswers,
}: {
  activeQuestionId: keyof OnboardingAnswers;
  setAnswers: Dispatch<SetStateAction<OnboardingAnswers>>;
}) {
  return (value: string) =>
    setAnswers((current) => ({
      ...current,
      [activeQuestionId]: value,
    }));
}

function createStepExitActionHandler({
  getNextAction,
  setStepExitAction,
}: {
  getNextAction: () => StepExitAction | null | void;
  setStepExitAction: Dispatch<SetStateAction<StepExitAction | null>>;
}) {
  return () => {
    const nextAction = getNextAction();

    if (nextAction) {
      setStepExitAction(nextAction);
    }
  };
}

function createStepLayerAnimationEndHandler({
  navigateToPath,
  setRoleScene,
  stepExitAction,
  setStepExitAction,
}: {
  navigateToPath: (path: string) => Promise<unknown> | void;
  setRoleScene: Dispatch<SetStateAction<RoleStepScene>>;
  stepExitAction: StepExitAction | null;
  setStepExitAction: Dispatch<SetStateAction<StepExitAction | null>>;
}) {
  return (event: AnimationEvent<HTMLDivElement>) => {
    const animationTarget = event.target as HTMLElement | null;

    if (
      !stepExitAction ||
      animationTarget?.dataset.testid !== "spielwiese-onboarding-step-layer"
    ) {
      return;
    }

    if (stepExitAction.kind === "show-role-bridge") {
      setStepExitAction(null);
      setRoleScene("bridge");
      return;
    }

    const nextPath = stepExitAction.path;
    void Promise.resolve(navigateToPath(nextPath))
      .then(() => {
        setStepExitAction(null);
      })
      .catch(() => {
        setStepExitAction(null);
      });
  };
}

function createRoleBridgeAnimationEndHandler({
  roleScene,
  setRoleScene,
}: {
  roleScene: RoleStepScene;
  setRoleScene: Dispatch<SetStateAction<RoleStepScene>>;
}) {
  return (_event: AnimationEvent<HTMLHeadingElement>) => {
    if (roleScene !== "bridge") {
      return;
    }

    setRoleScene("preview");
  };
}

// eslint-disable-next-line max-lines-per-function
function createOnboardingSceneHandlers({
  activeAnswer,
  activeQuestionId,
  activeStepIndex,
  isStepTransitioningOut,
  isRolePromptReady,
  navigateToPath,
  roleScene,
  roleApiKeyValue,
  roleModelValue,
  roleSystemPromptValue,
  setAnswers,
  setRoleApiKeyValue,
  setRoleModelValue,
  setRoleScene,
  setRoleSystemPromptValue,
  startRoleDashboardHandoff,
  stepExitAction,
  setStepExitAction,
}: {
  activeAnswer: string;
  activeQuestionId: keyof OnboardingAnswers;
  activeStepIndex: number;
  isStepTransitioningOut: boolean;
  isRolePromptReady: boolean;
  navigateToPath: (path: string) => Promise<unknown> | void;
  roleScene: RoleStepScene;
  roleApiKeyValue: string;
  roleModelValue: string;
  roleSystemPromptValue: string;
  setAnswers: Dispatch<SetStateAction<OnboardingAnswers>>;
  setRoleApiKeyValue: Dispatch<SetStateAction<string>>;
  setRoleModelValue: Dispatch<SetStateAction<string>>;
  setRoleScene: Dispatch<SetStateAction<RoleStepScene>>;
  setRoleSystemPromptValue: Dispatch<SetStateAction<string>>;
  startRoleDashboardHandoff: () => void;
  stepExitAction: StepExitAction | null;
  setStepExitAction: Dispatch<SetStateAction<StepExitAction | null>>;
}) {
  return {
    handleBack: createStepExitActionHandler({
      getNextAction: createOnboardingBackHandler(
        activeStepIndex,
        isStepTransitioningOut,
      ),
      setStepExitAction,
    }),
    handleContinue: () => {
      if (
        activeStepIndex === 0 &&
        roleScene === "preview" &&
        isRolePromptReady &&
        !isStepTransitioningOut
      ) {
        setRoleScene("model-selection");
        return;
      }

      if (
        activeStepIndex === 0 &&
        roleScene === "api-key" &&
        roleApiKeyValue.trim().length > 0 &&
        !isStepTransitioningOut
      ) {
        startRoleDashboardHandoff();
        return;
      }

      createStepExitActionHandler({
        getNextAction: createOnboardingContinueHandler({
          activeAnswer,
          activeStepIndex,
          isStepTransitioningOut,
          roleScene,
        }),
        setStepExitAction,
      })();
    },
    handleRoleBridgeAnimationEnd: createRoleBridgeAnimationEndHandler({
      roleScene,
      setRoleScene,
    }),
    handleSelect: createOnboardingSelectHandler({
      activeQuestionId,
      setAnswers,
    }),
    handleRoleApiKeyChange: (value: string) => {
      if (value !== roleApiKeyValue) {
        setRoleApiKeyValue(value);
      }
    },
    handleRoleModelChange: (value: string) => {
      if (value !== roleModelValue) {
        setRoleModelValue(value);
      }

      if (roleScene === "model-selection") {
        setRoleScene("api-key");
      }
    },
    handleRoleSystemPromptChange: (value: string) => {
      if (value !== roleSystemPromptValue) {
        setRoleSystemPromptValue(value);
      }
    },
    handleStepLayerAnimationEnd: createStepLayerAnimationEndHandler({
      navigateToPath,
      setRoleScene,
      stepExitAction,
      setStepExitAction,
    }),
  };
}

function getOnboardingCanvasStepState({
  answers,
  requestedStepId,
  roleScene,
  stepExitAction,
}: {
  answers: OnboardingAnswers;
  requestedStepId?: string;
  roleScene: RoleStepScene;
  stepExitAction: StepExitAction | null;
}) {
  const activeStepIndex = getActiveOnboardingStepIndex(
    answers,
    requestedStepId,
  );
  const activeQuestion = ONBOARDING_QUESTIONS[activeStepIndex];

  return {
    activeAnswer: answers[activeQuestion.id],
    activeQuestion,
    activeStepIndex,
    isStepTransitioningOut: stepExitAction !== null,
    showsUpperCanvas:
      activeQuestion.id === "role" &&
      roleScene !== "gate" &&
      roleScene !== "bridge",
  };
}

// eslint-disable-next-line max-lines-per-function
export function SpielwieseOnboardingCanvas({
  requestedStepId,
}: SpielwieseOnboardingCanvasProps) {
  const router = useRouter();
  const routeTransition = useSpielwieseRouteTransition();
  const [answers, setAnswers] = useState(EMPTY_ONBOARDING_ANSWERS);
  const [roleScene, setRoleScene] = useState<RoleStepScene>("gate");
  const [roleApiKeyValue, setRoleApiKeyValue] = useState("");
  const [roleModelValue, setRoleModelValue] = useState("Claude Opus 4.6");
  const [roleSystemPromptValue, setRoleSystemPromptValue] = useState("");
  const [stepExitAction, setStepExitAction] = useState<StepExitAction | null>(
    null,
  );
  const {
    activeAnswer,
    activeQuestion,
    activeStepIndex,
    isStepTransitioningOut,
    showsUpperCanvas,
  } = getOnboardingCanvasStepState({
    answers,
    requestedStepId,
    roleScene,
    stepExitAction,
  });
  const isRolePromptReady = roleSystemPromptValue.trim().length > 0;
  const navigateToPath = (path: string) => {
    const nextPath = appendCurrentSearchParams(path);

    if (path === getSpielwieseDashboardPath()) {
      routeTransition.start(() =>
        router.push(nextPath, undefined, {
          scroll: false,
        }),
      );
      return;
    }

    return router.push(nextPath, undefined, {
      shallow: true,
    });
  };
  const navigateToDashboardWithHandoff = () => {
    setOnboardingDashboardHandoff({
      modelValue: roleModelValue,
      systemPromptValue: roleSystemPromptValue,
      transitionKind: "role-flow",
    });

    void Promise.resolve(navigateToPath(getSpielwieseDashboardPath())).catch(
      () => {
        // Ignore navigation failures during the staged handoff.
      },
    );
  };
  const startRoleDashboardHandoff = () => {
    navigateToDashboardWithHandoff();
  };
  const {
    handleBack,
    handleContinue,
    handleRoleApiKeyChange,
    handleRoleBridgeAnimationEnd,
    handleRoleModelChange,
    handleRoleSystemPromptChange,
    handleSelect,
    handleStepLayerAnimationEnd,
  } = createOnboardingSceneHandlers({
    activeAnswer,
    activeQuestionId: activeQuestion.id,
    activeStepIndex,
    isStepTransitioningOut,
    isRolePromptReady,
    navigateToPath,
    roleScene,
    roleApiKeyValue,
    roleModelValue,
    roleSystemPromptValue,
    setAnswers,
    setRoleApiKeyValue,
    setRoleModelValue,
    setRoleScene,
    setRoleSystemPromptValue,
    startRoleDashboardHandoff,
    stepExitAction,
    setStepExitAction,
  });

  return (
    <SpielwieseOnboardingStepScene
      activeAnswer={activeAnswer}
      activeQuestionId={activeQuestion.id}
      activeStepIndex={activeStepIndex}
      handleBack={handleBack}
      handleContinue={handleContinue}
      handleRoleApiKeyChange={handleRoleApiKeyChange}
      handleRoleBridgeAnimationEnd={handleRoleBridgeAnimationEnd}
      handleRoleDashboardHandoffComplete={navigateToDashboardWithHandoff}
      handleRoleModelChange={handleRoleModelChange}
      handleRoleSystemPromptChange={handleRoleSystemPromptChange}
      handleSelect={handleSelect}
      handleStepLayerAnimationEnd={handleStepLayerAnimationEnd}
      isStepTransitioningOut={isStepTransitioningOut}
      roleApiKeyValue={roleApiKeyValue}
      roleHandoffTransition={null}
      roleModelValue={roleModelValue}
      roleSystemPromptValue={roleSystemPromptValue}
      roleScene={roleScene}
      showsUpperCanvas={showsUpperCanvas}
    />
  );
}
