"use client";

import React, { type RefObject } from "react";
import { spielwieseOnboardingHandoffUserMessage } from "../spielwieseOnboardingDashboardHandoff";

/* ─────────────────────────────────────────────────────────
 * DASHBOARD ENTRY STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after dashboard mount.
 *
 *    0ms   dashboard fades in with the seeded user message already visible
 * ───────────────────────────────────────────────────────── */

const dashboardRootTransition =
  "opacity 420ms cubic-bezier(0.23,1,0.32,1), transform 520ms cubic-bezier(0.22,1,0.36,1), filter 520ms cubic-bezier(0.23,1,0.32,1)";
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

function initializeDashboardRootReveal(root: HTMLDivElement) {
  const element = root;
  const previousFilter = element.style.filter;
  const previousOpacity = element.style.opacity;
  const previousPointerEvents = element.style.pointerEvents;
  const previousTransform = element.style.transform;
  const previousTransition = element.style.transition;
  let firstFrame = 0;
  let secondFrame = 0;

  element.style.transition = dashboardRootTransition;
  element.style.opacity = "0";
  element.style.transform = "translate3d(0,0,0)";
  element.style.filter = "blur(10px)";
  element.style.pointerEvents = "none";

  firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(() => {
      element.style.opacity = "1";
      element.style.transform = "translate3d(0,0,0)";
      element.style.filter = "blur(0px)";
      element.style.pointerEvents = "";
    });
  });

  return () => {
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(secondFrame);
    element.style.filter = previousFilter;
    element.style.opacity = previousOpacity;
    element.style.pointerEvents = previousPointerEvents;
    element.style.transform = previousTransform;
    element.style.transition = previousTransition;
  };
}

function initializeDashboardHandoffTransition({
  textarea,
}: {
  textarea: HTMLTextAreaElement;
}) {
  dispatchProgrammaticTextareaInput({
    textarea,
    value: spielwieseOnboardingHandoffUserMessage,
  });
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
  useMountEffect(() => {
    const root = rootRef.current;
    const detachedUserDeck = root?.querySelector(
      `[data-testid="${detachedUserDeckTestId}"]`,
    ) as HTMLElement | null;
    const textarea = root?.querySelector(
      `[aria-label="${targetNodeId} User message"]`,
    ) as HTMLTextAreaElement | null;

    if (!detachedUserDeck || !textarea) {
      return;
    }

    const clearRootReveal = root
      ? initializeDashboardRootReveal(root)
      : undefined;

    initializeDashboardHandoffTransition({
      textarea,
    });

    return () => {
      clearRootReveal?.();
    };
  }, [detachedUserDeckTestId, rootRef, targetNodeId]);

  return null;
}
