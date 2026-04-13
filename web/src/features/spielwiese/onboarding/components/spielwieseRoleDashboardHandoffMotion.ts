import React, { useState } from "react";

const HANDOFF_TUNING = {
  cardFadeDuration: 220,
  cardLiftDuration: 420,
  cardSettleHold: 80,
  veilFadeDuration: 320,
};

const TIMING = {
  modalFade: 260,
};

const useMountEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function hideDashboardTargetNode(root: HTMLDivElement, nodeId: string) {
  const targetNode = root.querySelector(
    `[data-spielwiese-node-id="${nodeId}"]`,
  ) as HTMLElement | null;

  if (!targetNode) {
    return null;
  }

  targetNode.style.opacity = "0";
  targetNode.style.pointerEvents = "none";

  return targetNode;
}

export function getRoleHandoffMotionTiming() {
  return {
    completeDelay: TIMING.modalFade + 60,
    cardFadeDuration: HANDOFF_TUNING.cardFadeDuration,
    cardLiftDuration: HANDOFF_TUNING.cardLiftDuration,
    modalFade: TIMING.modalFade,
    veilFadeDuration: HANDOFF_TUNING.veilFadeDuration,
  };
}

const roleHandoffMotionTiming = getRoleHandoffMotionTiming();

function createRoleHandoffTimers({
  onCardLift,
  onComplete,
  onModalHidden,
  onVeilFadeStart,
  onVeilHidden,
}: {
  onCardLift: () => void;
  onComplete: () => void;
  onModalHidden: () => void;
  onVeilFadeStart: () => void;
  onVeilHidden: () => void;
}) {
  const removeModalTimer = window.setTimeout(() => {
    onModalHidden();
    onCardLift();
  }, roleHandoffMotionTiming.modalFade);
  const startVeilFadeTimer = window.setTimeout(() => {
    onVeilFadeStart();
  }, roleHandoffMotionTiming.modalFade + roleHandoffMotionTiming.cardLiftDuration);
  const removeVeilTimer = window.setTimeout(
    () => {
      onVeilHidden();
    },
    roleHandoffMotionTiming.modalFade +
      roleHandoffMotionTiming.cardLiftDuration +
      roleHandoffMotionTiming.veilFadeDuration,
  );
  const completeTimer = window.setTimeout(() => {
    onComplete();
  }, roleHandoffMotionTiming.completeDelay);

  return () => {
    window.clearTimeout(removeModalTimer);
    window.clearTimeout(startVeilFadeTimer);
    window.clearTimeout(removeVeilTimer);
    window.clearTimeout(completeTimer);
  };
}

function restoreHiddenDashboardTargetNode(targetNode: HTMLElement | null) {
  targetNode?.style.setProperty("opacity", "");
  targetNode?.style.setProperty("pointer-events", "");
}

function applyFrozenRoleHandoffState({
  setIsCardFading,
  setIsCardLifted,
  setIsModalFading,
  setIsVeilFading,
  setShowsModal,
  setShowsVeil,
}: {
  setIsCardFading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCardLifted: React.Dispatch<React.SetStateAction<boolean>>;
  setIsModalFading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVeilFading: React.Dispatch<React.SetStateAction<boolean>>;
  setShowsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowsVeil: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  setIsCardFading(false);
  setIsCardLifted(true);
  setIsModalFading(true);
  setIsVeilFading(true);
  setShowsModal(false);
  setShowsVeil(false);
}

// eslint-disable-next-line max-lines-per-function
export function useRoleHandoffMotion({
  freezeAtLift = false,
  onComplete,
  targetNodeId,
  targetRootRef,
}: {
  freezeAtLift?: boolean;
  onComplete: () => void;
  targetNodeId: string;
  targetRootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [isCardFading, setIsCardFading] = useState(false);
  const [isCardLifted, setIsCardLifted] = useState(false);
  const [isModalFading, setIsModalFading] = useState(false);
  const [isVeilFading, setIsVeilFading] = useState(false);
  const [showsModal, setShowsModal] = useState(true);
  const [showsVeil, setShowsVeil] = useState(true);

  useMountEffect(() => {
    const targetRoot = targetRootRef.current;

    if (!targetRoot) {
      onComplete();
      return;
    }

    const hiddenTargetNode = hideDashboardTargetNode(targetRoot, targetNodeId);

    if (freezeAtLift) {
      applyFrozenRoleHandoffState({
        setIsCardFading,
        setIsCardLifted,
        setIsModalFading,
        setIsVeilFading,
        setShowsModal,
        setShowsVeil,
      });

      return () => {
        restoreHiddenDashboardTargetNode(hiddenTargetNode);
      };
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setIsModalFading(true);
    });
    const clearTimers = createRoleHandoffTimers({
      onCardLift: () => setIsCardLifted(true),
      onComplete,
      onModalHidden: () => setShowsModal(false),
      onVeilFadeStart: () => setIsVeilFading(true),
      onVeilHidden: () => {
        setShowsVeil(false);
      },
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      clearTimers();
      restoreHiddenDashboardTargetNode(hiddenTargetNode);
    };
  }, [freezeAtLift, onComplete, targetNodeId, targetRootRef]);

  return {
    isCardFading,
    isCardLifted,
    isModalFading,
    isVeilFading,
    showsModal,
    showsVeil,
  };
}
