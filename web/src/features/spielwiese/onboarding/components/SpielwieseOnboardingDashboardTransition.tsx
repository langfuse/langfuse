"use client";

import React, { useRef, type RefObject } from "react";
import { spielwieseOnboardingHandoffUserMessage } from "../spielwieseOnboardingDashboardHandoff";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after dashboard mount.
 *
 *    0ms   real user node starts hidden and soft-blurred
 *  500ms   real user node fades into its final position
 *  620ms   sample prompt types into the real textarea
 *   user   manual edits cancel the helper typing immediately
 *   360ms  after user input settles, the playground play button highlights
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  playHighlightLag: 360,
  typeCharacterEvery: 24,
  typingStart: 620,
  userNodeReveal: 500,
};

const userNodeTransition =
  "opacity 520ms cubic-bezier(0.23,1,0.32,1), transform 520ms cubic-bezier(0.23,1,0.32,1), filter 520ms cubic-bezier(0.23,1,0.32,1)";
const playButtonTransition =
  "transform 280ms cubic-bezier(0.23,1,0.32,1), box-shadow 280ms cubic-bezier(0.23,1,0.32,1), background-color 280ms cubic-bezier(0.23,1,0.32,1)";
const useMountEffect = React.useEffect;

function setNativeTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  valueSetter?.call(textarea, value);
}

function dispatchProgrammaticTextareaInput({
  textarea,
  value,
}: {
  textarea: HTMLTextAreaElement;
  value: string;
}) {
  setNativeTextareaValue(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setPlayButtonHighlight(
  playButton: HTMLButtonElement,
  highlighted: boolean,
) {
  const button = playButton;

  button.dataset.onboardingHighlight = highlighted ? "true" : "false";
  button.style.transition = playButtonTransition;
  button.style.backgroundColor = highlighted ? "rgba(57,114,243,0.12)" : "";
  button.style.boxShadow = highlighted
    ? "0 0 0 4px rgba(57,114,243,0.14), 0 14px 24px rgba(57,114,243,0.22)"
    : "";
  button.style.transform = highlighted ? "translateY(-1px) scale(1.03)" : "";
}

function setUserNodeVisibility({
  isVisible,
  userNode,
}: {
  isVisible: boolean;
  userNode: HTMLElement;
}) {
  const deck = userNode;

  deck.style.transition = userNodeTransition;
  deck.style.opacity = isVisible ? "1" : "0";
  deck.style.transform = isVisible
    ? "translate3d(0,0,0)"
    : "translate3d(0,18px,0)";
  deck.style.filter = isVisible ? "blur(0px)" : "blur(8px)";
  deck.style.pointerEvents = isVisible ? "auto" : "none";
}

// eslint-disable-next-line max-lines-per-function
function initializeDashboardHandoffTransition({
  detachedUserDeck,
  highlightTimerRef,
  isTypingProgrammaticallyRef,
  playButton,
  revealTimerRef,
  textarea,
  typingIntervalRef,
  typingStartTimerRef,
}: {
  detachedUserDeck: HTMLElement;
  highlightTimerRef: React.MutableRefObject<number | null>;
  isTypingProgrammaticallyRef: React.MutableRefObject<boolean>;
  playButton: HTMLButtonElement;
  revealTimerRef: React.MutableRefObject<number | null>;
  textarea: HTMLTextAreaElement;
  typingIntervalRef: React.MutableRefObject<number | null>;
  typingStartTimerRef: React.MutableRefObject<number | null>;
}) {
  const highlightTimer = highlightTimerRef;
  const programmaticTyping = isTypingProgrammaticallyRef;
  const revealTimer = revealTimerRef;
  const typingInterval = typingIntervalRef;
  const typingStartTimer = typingStartTimerRef;

  const clearHighlightTimer = () => {
    if (highlightTimer.current !== null) {
      window.clearTimeout(highlightTimer.current);
      highlightTimer.current = null;
    }
  };

  const clearTyping = () => {
    if (typingStartTimer.current !== null) {
      window.clearTimeout(typingStartTimer.current);
      typingStartTimer.current = null;
    }
    if (typingInterval.current !== null) {
      window.clearInterval(typingInterval.current);
      typingInterval.current = null;
    }
  };

  const stopHelperTyping = () => {
    programmaticTyping.current = false;
    clearTyping();
  };

  const schedulePlayHighlight = () => {
    clearHighlightTimer();
    setPlayButtonHighlight(playButton, false);
    highlightTimer.current = window.setTimeout(() => {
      if (textarea.value.trim().length > 0) {
        setPlayButtonHighlight(playButton, true);
      }
    }, TIMING.playHighlightLag);
  };

  const handleTextareaKeyDown = () => {
    stopHelperTyping();
    clearHighlightTimer();
    setPlayButtonHighlight(playButton, false);
  };

  const handleTextareaInput = () => {
    if (programmaticTyping.current) {
      return;
    }

    stopHelperTyping();
    schedulePlayHighlight();
  };

  const handlePlayClick = () => {
    clearHighlightTimer();
    setPlayButtonHighlight(playButton, false);
  };

  dispatchProgrammaticTextareaInput({
    textarea,
    value: "",
  });
  setPlayButtonHighlight(playButton, false);
  setUserNodeVisibility({
    isVisible: false,
    userNode: detachedUserDeck,
  });

  revealTimer.current = window.setTimeout(() => {
    setUserNodeVisibility({
      isVisible: true,
      userNode: detachedUserDeck,
    });

    typingStartTimer.current = window.setTimeout(() => {
      let index = 0;
      programmaticTyping.current = true;

      typingInterval.current = window.setInterval(() => {
        index += 1;
        dispatchProgrammaticTextareaInput({
          textarea,
          value: spielwieseOnboardingHandoffUserMessage.slice(0, index),
        });

        if (index >= spielwieseOnboardingHandoffUserMessage.length) {
          stopHelperTyping();
          textarea.focus();
          textarea.setSelectionRange(0, textarea.value.length);
        }
      }, TIMING.typeCharacterEvery);
    }, TIMING.typingStart - TIMING.userNodeReveal);
  }, TIMING.userNodeReveal);

  textarea.addEventListener("keydown", handleTextareaKeyDown);
  textarea.addEventListener("input", handleTextareaInput);
  textarea.addEventListener("change", handleTextareaInput);
  playButton.addEventListener("click", handlePlayClick);

  return () => {
    const deck = detachedUserDeck;
    const button = playButton;

    clearHighlightTimer();
    stopHelperTyping();
    if (revealTimer.current !== null) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
    textarea.removeEventListener("keydown", handleTextareaKeyDown);
    textarea.removeEventListener("input", handleTextareaInput);
    textarea.removeEventListener("change", handleTextareaInput);
    button.removeEventListener("click", handlePlayClick);
    deck.style.opacity = "";
    deck.style.transform = "";
    deck.style.filter = "";
    deck.style.pointerEvents = "";
    deck.style.transition = "";
    button.style.backgroundColor = "";
    button.style.boxShadow = "";
    button.style.transform = "";
    button.style.transition = "";
    delete button.dataset.onboardingHighlight;
  };
}

export function SpielwieseOnboardingDashboardTransition({
  detachedUserDeckTestId,
  rootRef,
  targetNodeId,
}: {
  detachedUserDeckTestId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  targetNodeId: string;
}) {
  const highlightTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const typingIntervalRef = useRef<number | null>(null);
  const typingStartTimerRef = useRef<number | null>(null);
  const isTypingProgrammaticallyRef = useRef(false);

  useMountEffect(() => {
    const root = rootRef.current;
    const detachedUserDeck = root?.querySelector(
      `[data-testid="${detachedUserDeckTestId}"]`,
    ) as HTMLElement | null;
    const textarea = root?.querySelector(
      `[aria-label="${targetNodeId} User message"]`,
    ) as HTMLTextAreaElement | null;
    const playButton = root?.querySelector(
      '[data-testid="spielwiese-playground-play-button"]',
    ) as HTMLButtonElement | null;

    if (!detachedUserDeck || !textarea || !playButton) {
      return;
    }

    return initializeDashboardHandoffTransition({
      detachedUserDeck,
      highlightTimerRef,
      isTypingProgrammaticallyRef,
      playButton,
      revealTimerRef,
      textarea,
      typingIntervalRef,
      typingStartTimerRef,
    });
  }, [detachedUserDeckTestId, rootRef, targetNodeId]);

  return null;
}
