"use client";

import { createPortal } from "react-dom";
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";

export type SpielwieseAgentNodeFocusFrame = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type FocusAnimationTargetElements = {
  backdrop: HTMLButtonElement | null;
  dialog: HTMLDivElement | null;
};

function getFocusFrame(element: HTMLDivElement | null) {
  if (!element) {
    return null;
  }

  const { height, left, top, width } = element.getBoundingClientRect();

  return {
    height,
    left,
    top,
    width,
  } satisfies SpielwieseAgentNodeFocusFrame;
}

function animateElement(
  element: Element | null,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
) {
  if (!element || typeof element.animate !== "function") {
    return;
  }

  element.animate(keyframes, options);
}

function createMorphKeyframes(
  fromFrame: SpielwieseAgentNodeFocusFrame,
  toRect: DOMRect,
) {
  const translateX = fromFrame.left - toRect.left;
  const translateY = fromFrame.top - toRect.top;
  const scaleX = fromFrame.width / toRect.width;
  const scaleY = fromFrame.height / toRect.height;

  return [
    {
      opacity: 0.92,
      transformOrigin: "top left",
      transform: `translate(${translateX}px,${translateY}px) scale(${scaleX},${scaleY})`,
    },
    {
      opacity: 1,
      transformOrigin: "top left",
      transform: "none",
    },
  ];
}

function playFocusModalOpenAnimation({
  backdrop,
  dialog,
  sourceFrame,
}: FocusAnimationTargetElements & {
  sourceFrame: SpielwieseAgentNodeFocusFrame | null;
}) {
  animateElement(backdrop, [{ opacity: 0 }, { opacity: 1 }], {
    duration: 220,
    easing: "ease-out",
    fill: "both",
  });

  if (!dialog) {
    return;
  }

  if (!sourceFrame) {
    animateElement(
      dialog,
      [
        {
          opacity: 0,
          transformOrigin: "top left",
          transform: "translateY(10px) scale(0.985)",
        },
        {
          opacity: 1,
          transformOrigin: "top left",
          transform: "none",
        },
      ],
      {
        duration: 280,
        easing: "cubic-bezier(0.22,1,0.36,1)",
        fill: "both",
      },
    );
    return;
  }

  animateElement(
    dialog,
    createMorphKeyframes(sourceFrame, dialog.getBoundingClientRect()),
    {
      duration: 320,
      easing: "cubic-bezier(0.22,1,0.36,1)",
      fill: "both",
    },
  );
}

export function useSpielwieseAgentNodeFocusMode(
  nodes: SpielwieseAgentNodeVM[],
) {
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [focusedPreviewFrame, setFocusedPreviewFrame] =
    useState<SpielwieseAgentNodeFocusFrame | null>(null);
  const [hoveredPreviewFrame, setHoveredPreviewFrame] =
    useState<SpielwieseAgentNodeFocusFrame | null>(null);
  const [hoveredPreviewNodeId, setHoveredPreviewNodeId] = useState<
    string | null
  >(null);
  const previewRegionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return {
    activePreviewSpotlightFrame: focusedNodeId ? null : hoveredPreviewFrame,
    closeFocusMode: () => {
      setFocusedPreviewFrame(null);
      setFocusedNodeId(null);
    },
    focusedNode: nodes.find((node) => node.id === focusedNodeId) ?? null,
    focusedNodeId,
    focusedPreviewFrame,
    getPreviewRegionRef:
      (nodeId: string) => (element: HTMLDivElement | null) => {
        previewRegionRefs.current[nodeId] = element;
      },
    handlePreviewHoverEnd: (nodeId: string) => {
      if (focusedNodeId) {
        return;
      }

      setHoveredPreviewNodeId((currentNodeId) =>
        currentNodeId === nodeId ? null : currentNodeId,
      );
      setHoveredPreviewFrame(null);
    },
    handlePreviewHoverStart: (nodeId: string) => {
      if (focusedNodeId) {
        return;
      }

      setHoveredPreviewNodeId(nodeId);
      setHoveredPreviewFrame(getFocusFrame(previewRegionRefs.current[nodeId]));
    },
    hoveredPreviewNodeId,
    togglePreviewFocus: (nodeId: string) => {
      setHoveredPreviewFrame(null);
      setHoveredPreviewNodeId(null);
      setFocusedNodeId((currentNodeId) => {
        if (currentNodeId === nodeId) {
          setFocusedPreviewFrame(null);
          return null;
        }

        setFocusedPreviewFrame(
          getFocusFrame(previewRegionRefs.current[nodeId]),
        );
        return nodeId;
      });
    },
  };
}

function getPortalTarget() {
  return typeof document === "undefined" ? null : document.body;
}

function FocusSpotlightWindow({
  frame,
}: {
  frame: SpielwieseAgentNodeFocusFrame;
}) {
  const haloInsetX = 18;
  const haloInsetY = 16;

  return (
    <div
      className="absolute rounded-[24px] shadow-[0_0_0_9999px_rgba(7,9,13,0.34),0_24px_64px_rgba(7,9,13,0.16)] ring-1 ring-white/10"
      data-testid="spielwiese-agent-node-preview-spotlight-window"
      style={{
        height: `${frame.height + haloInsetY * 2}px`,
        left: `${frame.left - haloInsetX}px`,
        top: `${frame.top - haloInsetY}px`,
        width: `${frame.width + haloInsetX * 2}px`,
      }}
    />
  );
}

export function SpielwieseAgentNodePreviewSpotlight({
  frame,
}: {
  frame: SpielwieseAgentNodeFocusFrame | null;
}) {
  const portalTarget = getPortalTarget();

  if (!frame || !portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[120]"
      data-testid="spielwiese-agent-node-preview-spotlight"
    >
      <FocusSpotlightWindow frame={frame} />
    </div>,
    portalTarget,
  );
}

export function SpielwieseAgentNodeFocusModal({
  children,
  isOpen,
  nodeId,
  sourceFrame,
  onClose,
}: {
  children: ReactNode;
  isOpen: boolean;
  nodeId: string;
  sourceFrame: SpielwieseAgentNodeFocusFrame | null;
  onClose: () => void;
}) {
  const portalTarget = getPortalTarget();
  const backdropRef = useRef<HTMLButtonElement | null>(null);

  const scheduleOpenAnimation = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        return;
      }

      requestAnimationFrame(() => {
        playFocusModalOpenAnimation({
          backdrop: backdropRef.current,
          dialog: element,
          sourceFrame,
        });
      });
    },
    [sourceFrame],
  );

  if (!isOpen || !portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center px-3 py-3"
      data-testid="spielwiese-agent-node-focus-modal-root"
    >
      <button
        aria-label={`Close ${nodeId} focus mode`}
        className="absolute inset-0 border-0 bg-[rgba(7,9,13,0.42)] p-0 backdrop-blur-[2px]"
        onClick={onClose}
        ref={backdropRef}
        type="button"
      />
      <div
        aria-label={`${nodeId} focus mode`}
        aria-modal="true"
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-[min(78.125rem,calc(100vw-1.5rem))] origin-top-left items-start justify-center overflow-auto will-change-transform"
        data-testid="spielwiese-agent-node-focus-modal"
        ref={scheduleOpenAnimation}
        role="dialog"
      >
        {children}
      </div>
    </div>,
    portalTarget,
  );
}
