"use client";

import React, { type RefObject } from "react";
import { spielwieseOnboardingHandoffUserMessage } from "../spielwieseOnboardingDashboardHandoff";

/* ─────────────────────────────────────────────────────────
 * DASHBOARD ENTRY STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after dashboard mount.
 *
 *    0ms   dashboard mounts with the seeded user message already visible
 * ───────────────────────────────────────────────────────── */

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

    initializeDashboardHandoffTransition({
      textarea,
    });
  }, [detachedUserDeckTestId, rootRef, targetNodeId]);

  return null;
}
