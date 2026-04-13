"use client";

import { createPortal } from "react-dom";
import { useRef, useState, type ReactNode } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";

export type SpielwieseAgentNodeFocusFrame = {
  height: number;
  left: number;
  top: number;
  width: number;
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

export function useSpielwieseAgentNodeFocusMode(
  nodes: SpielwieseAgentNodeVM[],
) {
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hoveredPreviewFrame, setHoveredPreviewFrame] =
    useState<SpielwieseAgentNodeFocusFrame | null>(null);
  const [hoveredPreviewNodeId, setHoveredPreviewNodeId] = useState<
    string | null
  >(null);
  const previewRegionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return {
    activePreviewSpotlightFrame: focusedNodeId ? null : hoveredPreviewFrame,
    focusedNode: nodes.find((node) => node.id === focusedNodeId) ?? null,
    focusedNodeId,
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
    setFocusedNodeId,
    togglePreviewFocus: (nodeId: string) => {
      setHoveredPreviewFrame(null);
      setHoveredPreviewNodeId(null);
      setFocusedNodeId((currentNodeId) =>
        currentNodeId === nodeId ? null : nodeId,
      );
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
  onClose,
}: {
  children: ReactNode;
  isOpen: boolean;
  nodeId: string;
  onClose: () => void;
}) {
  const portalTarget = getPortalTarget();

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
        type="button"
        onClick={onClose}
      />
      <div
        aria-label={`${nodeId} focus mode`}
        aria-modal="true"
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-[min(92rem,calc(100vw-1.5rem))] items-start justify-center overflow-auto"
        data-testid="spielwiese-agent-node-focus-modal"
        role="dialog"
      >
        {children}
      </div>
    </div>,
    portalTarget,
  );
}
